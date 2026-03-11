import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    ignores: ['**/dist/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Backend TypeScript configuration
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2024,
      parser: tseslint.parser,
      globals: { ...globals.node, ...globals.es2024 },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-process-exit': 'error',
      'no-sync': 'warn',
    },
  },
  // Frontend JavaScript configuration
  {
    files: ['pages/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'prefer-const': 'error',
      'no-var': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-undef': 'error',
      'no-redeclare': 'error',
      'no-use-before-define': ['error', { functions: false }],
      'prefer-arrow-callback': 'warn',
      'arrow-body-style': ['warn', 'as-needed'],
      'object-shorthand': ['warn', 'always'],
      'prefer-template': 'warn',
      'prefer-destructuring': [
        'warn',
        { array: false, object: true },
        { enforceForRenamedProperties: false },
      ],
    },
  },
]);
