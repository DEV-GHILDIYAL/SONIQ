/**
 * Smaller release APKs. On every prebuild:
 * android/gradle.properties
 *  - reactNativeArchitectures=arm64-v8a  : only 64-bit ARM native code (all phones from ~2017+).
 *    Drops armeabi-v7a, x86, x86_64 — the biggest win (~60% smaller).
 *  - android.enableMinifyInReleaseBuilds : R8 removes unused Java/Kotlin code.
 *  - android.enableShrinkResourcesInReleaseBuilds : removes unused Android resources.
 * android/app/build.gradle
 *  - resourceConfigurations "en": drop the translated strings that AndroidX/Material ship for
 *    80+ languages (SONIQ's UI is English). System dialogs still follow the phone's language.
 * Debug/dev builds (expo run:android) are unaffected except the ABI list.
 */
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const PROPS = {
  reactNativeArchitectures: 'arm64-v8a',
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
};

const LANG_MARK = '// SONIQ: English-only resources';

function withProps(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPS)) {
      cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === key));
      cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
}

function withEnglishOnly(config) {
  return withAppBuildGradle(config, (cfg) => {
    const src = cfg.modResults.contents;
    if (src.includes(LANG_MARK)) return cfg;
    const next = src.replace(
      /defaultConfig\s*\{/,
      (m) => `${m}\n        ${LANG_MARK}\n        resourceConfigurations += ["en"]`,
    );
    if (next === src) console.warn('[withAndroidSize] defaultConfig not found; language filter skipped');
    cfg.modResults.contents = next;
    return cfg;
  });
}

module.exports = function withAndroidSize(config) {
  return withEnglishOnly(withProps(config));
};
