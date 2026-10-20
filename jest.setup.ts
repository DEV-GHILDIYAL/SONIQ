/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories must use require() */
// Global test mocks for native modules that have no JS implementation in Jest.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
// Icon fonts can't load under Jest; render icons as nothing.
jest.mock('@expo/vector-icons', () => {
  const Icon = Object.assign(() => null, { glyphMap: {} });
  return { Ionicons: Icon };
});
jest.mock('@expo/vector-icons/Ionicons', () => {
  const Icon = Object.assign(() => null, { glyphMap: {} });
  return { __esModule: true, default: Icon };
});
