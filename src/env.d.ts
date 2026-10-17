// Public env vars (EXPO_PUBLIC_*) are inlined into the app bundle at build time.
// Never put secrets here.
declare namespace NodeJS {
  interface ProcessEnv {
    readonly EXPO_PUBLIC_JAMENDO_CLIENT_ID?: string;
    readonly EXPO_PUBLIC_SONIQ_SERVER_URL?: string;
    readonly EXPO_PUBLIC_SONIQ_SERVER_KEY?: string;
    readonly EXPO_PUBLIC_SUPABASE_URL?: string;
    readonly EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
  }
}

// Side-effect-only polyfill without bundled types (see src/lib/polyfills.ts).
declare module 'fast-text-encoding';
