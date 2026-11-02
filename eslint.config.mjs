import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '.data/**', 'apps/api/openapi.json'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Money must go through @ros/domain (ADR-0006): parseFloat on amounts is a bug.
    files: ['apps/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Use Money/Qty from @ros/domain for decimals.' },
      ],
    },
  },
  {
    // Nest uses runtime type metadata for DI: constructor-injected classes must be value imports.
    files: ['apps/api/src/**/*.ts', 'apps/api/test/**/*.ts'],
    rules: { '@typescript-eslint/consistent-type-imports': 'off' },
  },
  {
    files: ['scripts/**/*.mjs', 'apps/api/prisma/*.js', 'packages/pos-core/crash/*.cjs'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-require-imports': 'off' },
  },
);
