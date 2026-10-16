// Public env vars (EXPO_PUBLIC_*) are inlined into the app bundle at build time.
// Never put secrets here.
declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_JAMENDO_CLIENT_ID?: string;
  }
}
