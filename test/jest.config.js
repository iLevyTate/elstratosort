/**
 * Jest configuration for StratoSort tests (unit + integration).
 * Updated to Jest 29 syntax—removed deprecated options that triggered warnings.
 */

module.exports = {
  displayName: 'Stratosort Tests',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>'],
  testMatch: [
    '**/__tests__/**/*.+(js|ts|tsx)',
    '**/*.(test|spec).+(js|ts|tsx)',
  ],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-react',
          '@babel/preset-typescript',
        ],
      },
    ],
  },
  // No transforms needed for plain JS
  collectCoverageFrom: ['../src/**/*.ts', '../src/**/*.tsx', '!../src/**/node_modules/**'],
  coverageDirectory: '../coverage',
  setupFilesAfterEnv: ['<rootDir>/test-setup.ts'],
  // Sequential execution keeps Ollama mocks deterministic
  maxWorkers: 1,

  moduleNameMapper: {
    '^electron$': '<rootDir>/mocks/electron.ts',
    '^ollama$': '<rootDir>/mocks/ollama.ts',
    '^officeparser$': '<rootDir>/mocks/officeparser.ts',
    '^node-tesseract-ocr$': '<rootDir>/mocks/tesseract.ts',
    '^sharp$': '<rootDir>/mocks/sharp.ts',
    '^xlsx-populate$': '<rootDir>/mocks/xlsx.ts',
    '^sanitize-html$': '<rootDir>/mocks/sanitize-html.ts',
    '^music-metadata$': '<rootDir>/mocks/music-metadata.ts',
  },

  // Global setup for DOM-dependent packages
  setupFiles: ['<rootDir>/test-globals.ts'],

  // Transform ESM packages that Jest can't handle natively
  transformIgnorePatterns: [
    'node_modules/(?!(nanoid)/)',
  ],
};
