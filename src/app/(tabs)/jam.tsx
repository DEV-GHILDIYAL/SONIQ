import { Redirect, useLocalSearchParams } from 'expo-router';

/** Old route (and soniq://jam?code=… links): Jam now lives in the Crew tab. */
export default function JamRedirect() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return (
    <Redirect href={{ pathname: '/crew', params: code ? { tab: 'jam', code } : { tab: 'jam' } }} />
  );
}
