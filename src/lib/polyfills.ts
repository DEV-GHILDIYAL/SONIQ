/**
 * JS-only web API polyfills (no native code, no rebuild needed).
 * Needed by youtubei.js: full URL/URLSearchParams and TextDecoder.
 * Imported first in src/app/_layout.tsx.
 */
import 'react-native-url-polyfill/auto';
import 'fast-text-encoding';
