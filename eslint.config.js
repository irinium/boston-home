// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*', 'coverage/*', 'supabase/functions/*'] },
  {
    // jest.mock factories and isolated module loads need require().
    files: ['**/*.test.{ts,tsx}', 'test/**/*'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
]);
