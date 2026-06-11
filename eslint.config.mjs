import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Classic Hook rules only. The v7 "recommended-latest" preset also pulls
      // in the experimental React Compiler lints (purity/immutability/...),
      // which we deliberately leave off for now.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-empty-function': 'off',
      'no-empty': ['warn', { allowEmptyCatch: false }],
    },
  },
  {
    // Node-run scripts and CommonJS/ESM config files use Node globals.
    files: ['**/*.mjs', '**/*.cjs', 'scripts/**'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    ignores: ['dist/**', 'release/**', 'node_modules/**', 'public/**', 'build/**'],
  },
);
