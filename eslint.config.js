// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

const adapterImportBlock = {
  group: [
    '@/sources/*',
    '!@/sources/registry',
    '!@/sources/types',
    '**/sources/*',
    '!**/sources/registry',
    '!**/sources/types',
  ],
  message:
    'UI must not import source adapters directly. Use @/sources/registry (or @/sources/types).',
};

const audioBlock = {
  name: 'expo-audio',
  message: 'Audio is controlled only from src/player/. Use the player module instead.',
};

module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*', 'android/*', 'ios/*', 'coverage/*', 'server/*', 'supabase/functions/*']),
  expoConfig,
  {
    // Architecture rules for UI code.
    files: ['src/components/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [adapterImportBlock], paths: [audioBlock] }],
    },
  },
  {
    // Only src/player/ may touch the native audio module.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/player/**', 'src/components/**', 'src/app/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: [audioBlock] }],
    },
  },
  prettierConfig,
]);
