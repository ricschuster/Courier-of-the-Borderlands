import { describe, it, expect } from 'vitest';
import { verdict } from '../../scripts/e2e-verdict.mjs';

const inScopeAnd = (shardsResult) =>
  verdict({ scopeResult: 'success', inScope: 'true', shardsResult });

describe('verdict', () => {
  it('passes when every shard passed', () => {
    expect(inScopeAnd('success').ok).toBe(true);
  });

  it('fails when a shard failed', () => {
    // GitHub reports a matrix as success only when every leg succeeded, so one
    // red shard arrives here as a single 'failure'.
    expect(inScopeAnd('failure').ok).toBe(false);
  });

  it('fails when the shards were cancelled', () => {
    expect(inScopeAnd('cancelled').ok).toBe(false);
  });

  it('fails when the shards were skipped despite being in scope', () => {
    // Should not happen, but a suite that did not run must never report as a
    // suite that passed.
    expect(inScopeAnd('skipped').ok).toBe(false);
  });

  it('fails on a result it does not recognise', () => {
    expect(inScopeAnd('').ok).toBe(false);
    expect(inScopeAnd('something-new').ok).toBe(false);
  });

  it('passes when the change is out of scope and the shards never ran', () => {
    expect(verdict({ scopeResult: 'success', inScope: 'false', shardsResult: 'skipped' })).toEqual({
      ok: true,
      message: 'Nothing in this change can reach the bundle; browser suite skipped.',
    });
  });

  describe('when the scope job did not answer', () => {
    // The bug the shell version of this shipped with: a crashed scope job
    // leaves `run` empty, which reads as "out of scope" and passes the check
    // without the suite ever running.
    it('fails rather than reading an empty output as out of scope', () => {
      const result = verdict({ scopeResult: 'failure', inScope: '', shardsResult: 'skipped' });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('failure');
    });

    it('fails when the scope job was cancelled or skipped', () => {
      expect(verdict({ scopeResult: 'cancelled', inScope: '', shardsResult: 'skipped' }).ok).toBe(
        false,
      );
      expect(verdict({ scopeResult: 'skipped', inScope: '', shardsResult: 'skipped' }).ok).toBe(
        false,
      );
    });

    it('fails when there is no result at all, and says so', () => {
      const result = verdict({ scopeResult: '', inScope: '', shardsResult: '' });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('no result');
    });
  });
});
