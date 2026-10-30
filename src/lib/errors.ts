/**
 * Thrown by a source when a track can never be played (removed, no stream, file gone).
 * The engine hides such tracks from future listings. Network errors must NOT use this,
 * otherwise going offline would hide songs permanently.
 */
export class TrackUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrackUnavailableError';
  }
}

export const isTrackUnavailable = (err: unknown): boolean =>
  err instanceof TrackUnavailableError ||
  (err instanceof Error && err.name === 'TrackUnavailableError');

export interface FriendlyError {
  title: string;
  message: string;
  /** Network-type problem: retrying later can help. */
  network: boolean;
}

/** Turn a technical error into words a listener understands. */
export function friendlyError(err: unknown): FriendlyError {
  const raw = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  if (isTrackUnavailable(err) || /\b(404|410)\b|not found|unavailable|removed|private/.test(raw)) {
    return {
      title: 'Not available',
      message: 'This song or page is no longer available.',
      network: false,
    };
  }
  if (
    /offline|network|timed? ?out|timeout|fetch|socket|connection|unreachable|dns|abort/.test(raw)
  ) {
    return {
      title: 'No connection',
      message: 'Your internet looks slow or off. Check it and try again.',
      network: true,
    };
  }
  if (/\b(5\d\d)\b|server/.test(raw)) {
    return {
      title: 'Service is busy',
      message: 'The music service is having trouble. Try again in a bit.',
      network: true,
    };
  }
  return {
    title: 'Something went wrong',
    message: 'That did not work. Try again.',
    network: false,
  };
}

/** Player error line: our own offline notes stay as they are, the rest becomes plain words. */
export function playerErrorText(error: string): string {
  if (/^(you're offline|offline:)/i.test(error)) return error;
  return friendlyError(new Error(error)).message;
}
