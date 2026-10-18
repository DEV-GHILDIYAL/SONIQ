/**
 * Signs release builds with SONIQ's own key instead of the debug key (fewer Play Protect
 * warnings, and updates install over the old app). Reads credentials/signing.properties
 * (gitignored) at Gradle time; if it is missing, release falls back to the debug key.
 *
 * credentials/signing.properties:
 *   storeFile=soniq-release.keystore
 *   storePassword=...
 *   keyAlias=soniq
 *   keyPassword=...
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// SONIQ release signing';

const SIGNING_CONFIG = `
        ${MARK}
        release {
            def soniqProps = new Properties()
            def soniqFile = rootProject.file('../credentials/signing.properties')
            if (soniqFile.exists()) {
                soniqFile.withInputStream { soniqProps.load(it) }
                storeFile rootProject.file('../credentials/' + soniqProps['storeFile'])
                storePassword soniqProps['storePassword']
                keyAlias soniqProps['keyAlias']
                keyPassword soniqProps['keyPassword']
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARK)) return cfg;
    // 1) Add a "release" signing config next to the debug one.
    src = src.replace(/signingConfigs\s*\{/, (m) => `${m}${SIGNING_CONFIG}`);
    // 2) Use it for release builds when the credentials file exists.
    src = src.replace(
      /(release\s*\{[^{}]*?)signingConfig signingConfigs\.debug/,
      `$1signingConfig rootProject.file('../credentials/signing.properties').exists() ? signingConfigs.release : signingConfigs.debug`,
    );
    cfg.modResults.contents = src;
    return cfg;
  });
};
