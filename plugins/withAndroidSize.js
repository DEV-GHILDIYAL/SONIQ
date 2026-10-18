/**
 * Smaller release APKs. Sets android/gradle.properties on every prebuild:
 *  - reactNativeArchitectures=arm64-v8a  : only 64-bit ARM native code (all phones from ~2017+).
 *    Drops armeabi-v7a, x86, x86_64 — the biggest win (~60% smaller).
 *  - android.enableMinifyInReleaseBuilds : R8 removes unused Java/Kotlin code.
 *  - android.enableShrinkResourcesInReleaseBuilds : removes unused Android resources.
 * Debug/dev builds (expo run:android) are unaffected except the ABI list.
 */
const { withGradleProperties } = require('expo/config-plugins');

const PROPS = {
  reactNativeArchitectures: 'arm64-v8a',
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
};

module.exports = function withAndroidSize(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPS)) {
      cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === key));
      cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
};
