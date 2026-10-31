import { ClansView } from '@/components/ClansView';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';

/** Clans tab: your crews, their chats and shared Jams. */
export default function ClansScreen() {
  return (
    <Screen>
      <ScreenHeader title="Clans" />
      <ClansView />
    </Screen>
  );
}
