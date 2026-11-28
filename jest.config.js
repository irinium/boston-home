/** Unit tests (Jest + React Native Testing Library). Database behaviour is tested separately: npm run test:db. */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: { '\\.css$': '<rootDir>/test/style-stub.js' },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  // Screen tests live outside src/app, because Expo Router treats every file there as a route.
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}', '<rootDir>/test/**/*.test.{ts,tsx}'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/lib/types.ts'],
  coverageReporters: ['text', 'text-summary', 'lcov'],
  coverageThreshold: {
    global: { statements: 80, branches: 80, functions: 80, lines: 80 },
  },
};
