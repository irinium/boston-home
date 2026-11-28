/** Unit tests (Jest + React Native Testing Library). Database behaviour is tested separately: npm run test:db. */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: { '\\.css$': '<rootDir>/test/style-stub.js' },
  // The first run transforms many modules; the default 5 s is too short for it.
  testTimeout: 15000,
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  // Screen tests live outside src/app, because Expo Router treats every file there as a route.
  testMatch: [
    '<rootDir>/src/**/*.test.{ts,tsx}',
    '<rootDir>/test/**/*.test.{ts,tsx}',
    '<rootDir>/supabase/functions/_shared/**/*.test.ts',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    'supabase/functions/_shared/**/*.ts',
    '!**/*.test.{ts,tsx}',
    '!src/lib/types.ts',
    '!src/**/*.d.ts',
  ],
  coverageReporters: ['text', 'text-summary', 'lcov'],
  coverageThreshold: {
    global: { statements: 80, branches: 80, functions: 80, lines: 80 },
  },
};
