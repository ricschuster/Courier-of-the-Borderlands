// Turns the shard jobs' results into the one verdict the `e2e` required status
// check reports.
//
// Why this exists: a matrix job reports as `e2e (1)`, `e2e (2)`, ... never as
// `e2e`, so the sharded suite cannot own the required context itself. An
// aggregator job does, and this is its logic (#422).
//
// Why it is a tested module and not a shell block: every wrong answer here is
// silent in the dangerous direction. Reporting a pass when the suite did not
// run looks exactly like reporting a pass when it ran and was green. The first
// draft of this as shell already had that bug, treating a crashed scope job as
// "out of scope, nothing to do".
//
// Reads SCOPE_RESULT, IN_SCOPE and SHARDS from the environment and exits
// non-zero to fail the check.

/**
 * @param {object} input
 * @param {string} input.scopeResult result of the scope job
 * @param {string} input.inScope the scope job's `run` output, as a string
 * @param {string} input.shardsResult result of the shard matrix, which GitHub
 *   reports as success only when every shard succeeded
 * @returns {{ ok: boolean, message: string }}
 */
export function verdict({ scopeResult, inScope, shardsResult }) {
  // An unanswered question is not an answer of no. A failed or skipped scope
  // job leaves `run` empty, which would otherwise read as "out of scope".
  if (scopeResult !== 'success') {
    return {
      ok: false,
      message: `The scope job did not succeed (${scopeResult || 'no result'}); refusing to report a pass.`,
    };
  }

  if (inScope !== 'true') {
    return {
      ok: true,
      message: 'Nothing in this change can reach the bundle; browser suite skipped.',
    };
  }

  if (shardsResult === 'success') {
    return { ok: true, message: 'Every browser shard passed.' };
  }

  // Anything else (failure, cancelled, skipped) is a suite that did not
  // demonstrably pass, which must not report as one.
  return {
    ok: false,
    message: `The browser shards did not pass (${shardsResult || 'no result'}).`,
  };
}

function main() {
  const { ok, message } = verdict({
    scopeResult: process.env.SCOPE_RESULT ?? '',
    inScope: process.env.IN_SCOPE ?? '',
    shardsResult: process.env.SHARDS ?? '',
  });

  console.log(message);
  if (!ok) process.exit(1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
