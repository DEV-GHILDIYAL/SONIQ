/**
 * Remembers which genre a song was found under (e.g. tapped "Lo-fi" then played a result),
 * so listening history can store a genre even though sources rarely provide one.
 */
const MAX = 500;
const genreByTrack = new Map<string, string>();

export function tagGenre(trackIds: readonly string[], genre: string): void {
  for (const id of trackIds) {
    genreByTrack.delete(id);
    genreByTrack.set(id, genre);
  }
  while (genreByTrack.size > MAX) {
    const oldest = genreByTrack.keys().next().value;
    if (oldest === undefined) break;
    genreByTrack.delete(oldest);
  }
}

export const genreOf = (trackId: string): string | null => genreByTrack.get(trackId) ?? null;
