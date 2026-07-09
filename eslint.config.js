import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'coverage/',
      'node_modules/',
      'playwright-report/',
      'test-results/',
      // Agent git worktrees hold full repo copies outside this tsconfig.
      '.claude/worktrees/',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Plain-JS Node scripts (dev tooling) run under Node, not the browser, so
    // give them the Node/runtime globals they use.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
        // Referenced inside a page.waitForFunction callback (runs in the browser).
        window: 'readonly',
      },
    },
  },
);
