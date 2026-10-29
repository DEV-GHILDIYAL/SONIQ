/**
 * Public build-time config. Expo inlines `process.env.EXPO_PUBLIC_*` only when it is
 * referenced literally like below, so keep every variable spelled out here.
 */
export const env = {
  jamendoClientId: (process.env.EXPO_PUBLIC_JAMENDO_CLIENT_ID ?? '').trim(),
  /** SONIQ backend (server/) for the YouTube source. Empty = YouTube disabled. */
  soniqServerUrl: (process.env.EXPO_PUBLIC_SONIQ_SERVER_URL ?? '').trim(),
  soniqServerKey: (process.env.EXPO_PUBLIC_SONIQ_SERVER_KEY ?? '').trim(),
  /** Supabase Realtime for Jam (listen together). Anon key is public by design. */
  supabaseUrl: (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim(),
  supabaseAnonKey: (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
  /** Groq API Key for AI smart recommendations and radio. */
  groqApiKey: (process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '').trim(),
};
