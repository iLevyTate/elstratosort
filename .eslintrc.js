module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    'jest/globals': true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jest/recommended',
  ],
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['react', 'react-hooks', 'jest'],
  rules: {
    'react/react-in-jsx-scope': 'off',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  overrides: [
    {
      // TypeScript files
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'plugin:jest/recommended',
      ],
      plugins: ['@typescript-eslint', 'react', 'react-hooks', 'jest'],
      rules: {
        'react/react-in-jsx-scope': 'off',
        // Warnings for gradual adoption - these should be fixed over time
        '@typescript-eslint/no-unused-vars': [
          'warn',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/no-empty-function': 'warn',
        '@typescript-eslint/no-empty-object-type': 'warn',
        '@typescript-eslint/no-require-imports': 'warn',
        '@typescript-eslint/no-this-alias': 'warn',
        '@typescript-eslint/ban-ts-comment': 'warn',
        '@typescript-eslint/no-unused-expressions': 'warn',
        // React hooks - warn instead of error for gradual migration
        'react-hooks/exhaustive-deps': 'warn',
        'react-hooks/rules-of-hooks': 'error',
        // Disabled rules that don't exist in v4.6.2 of eslint-plugin-react-hooks
        // 'react-hooks/refs': 'off', // Only in v7+
        // Common issues in existing codebase
        'prefer-const': 'warn',
        'no-useless-escape': 'warn',
        'react/prop-types': 'off', // TypeScript handles prop validation
        'react/display-name': 'off',
        // Allow console for dev/debugging
        'no-console': 'off',
        // Jest - conditional expects are common in utility tests
        'jest/no-conditional-expect': 'warn',
      },
    },
  ],
  // Ignore test mocks and build output
  ignorePatterns: [
    'dist/',
    'coverage/',
    'node_modules/',
    '.webpack-cache/',
    'release/',
  ],
};
