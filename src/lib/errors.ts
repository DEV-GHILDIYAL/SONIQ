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
