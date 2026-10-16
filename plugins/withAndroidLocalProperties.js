/**
 * Writes android/local.properties on every prebuild:
 *  - sdk.dir   : ANDROID_HOME / ANDROID_SDK_ROOT, or the OS default SDK location
 *  - cmake.dir : newest CMake installed in <sdk>/cmake
 *
 * Why: `expo prebuild --clean` deletes local.properties, and on Windows the
 * default CMake 3.22.1 ships a ninja that fails on paths > 260 chars
 * (react-native-gesture-handler codegen). CMake >= 3.31 ships a long-path-aware ninja.
 * Machine-specific paths are resolved at prebuild time, never committed.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MIN_CMAKE = [3, 31];

function defaultSdkDir() {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv) return fromEnv;
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
  }
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Android', 'sdk');
  return path.join(os.homedir(), 'Android', 'Sdk');
}

function parseVersion(name) {
  const parts = name.split('.').map((n) => Number.parseInt(n, 10));
  return parts.every((n) => Number.isFinite(n)) ? parts : null;
}

function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function newestCmake(sdkDir) {
  const cmakeRoot = path.join(sdkDir, 'cmake');
  if (!fs.existsSync(cmakeRoot)) return null;
  const versions = fs
    .readdirSync(cmakeRoot)
    .map((name) => ({ name, v: parseVersion(name) }))
    .filter((x) => x.v && fs.existsSync(path.join(cmakeRoot, x.name, 'bin')))
    .sort((a, b) => compareVersions(b.v, a.v));
  return versions[0] ? { dir: path.join(cmakeRoot, versions[0].name), v: versions[0].v } : null;
}

/** Escape a value for a Java .properties file (backslashes and colons). */
function escapeProp(value) {
  return value.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
}

function writeLocalProperties(androidDir) {
  const sdkDir = defaultSdkDir();
  if (!fs.existsSync(sdkDir)) {
    console.warn(
      `[withAndroidLocalProperties] Android SDK not found at ${sdkDir}. Set ANDROID_HOME.`,
    );
    return;
  }
  const file = path.join(androidDir, 'local.properties');
  const managed = { 'sdk.dir': sdkDir };

  const cmake = newestCmake(sdkDir);
  if (cmake) {
    managed['cmake.dir'] = cmake.dir;
    if (process.platform === 'win32' && compareVersions(cmake.v, MIN_CMAKE) < 0) {
      console.warn(
        `[withAndroidLocalProperties] Newest CMake is ${cmake.v.join('.')}. Install CMake ${MIN_CMAKE.join('.')}+ ` +
          'from Android Studio SDK Tools, otherwise the build can fail with "Filename longer than 260 characters".',
      );
    }
  }

  const kept = fs.existsSync(file)
    ? fs
        .readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .filter(
          (line) => line.trim() && !Object.keys(managed).some((k) => line.startsWith(`${k}=`)),
        )
    : [];
  const lines = [...kept, ...Object.entries(managed).map(([k, v]) => `${k}=${escapeProp(v)}`)];
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

module.exports = function withAndroidLocalProperties(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      writeLocalProperties(cfg.modRequest.platformProjectRoot);
      return cfg;
    },
  ]);
};
