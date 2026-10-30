import { Redirect } from 'expo-router';

/** Old route: Clans now live in the Crew tab. */
export default function ClansRedirect() {
  return <Redirect href={{ pathname: '/crew', params: { tab: 'clans' } }} />;
}
