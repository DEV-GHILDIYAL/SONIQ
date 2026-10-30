import { friendlyError } from '@/lib/errors';
import { useNetworkStore } from '@/lib/network';
import { EmptyState } from './EmptyState';

/** Error screen in plain words, always with a Retry button. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const offline = useNetworkStore((s) => s.offline);
  const f = offline
    ? {
        title: "You're offline",
        message: 'Connect to the internet and try again. Saved songs still play.',
        network: true,
      }
    : friendlyError(error);
  return (
    <EmptyState
      icon={f.network ? 'cloud-offline-outline' : 'alert-circle-outline'}
      title={f.title}
      message={f.message}
      actionLabel="Retry"
      onAction={onRetry}
    />
  );
}
