# Personal recommendations (v1.5.0)

1. Uses ONLY the listener's own activity on their phone. No other users' data.
2. Signals (`src/lib/taste.ts`): finished ≥80% +1, partial +0.3, skipped <30 s −0.7, like +2, unlike −1, added to a playlist +1.5, "not interested" −3. Per song and per main artist (artist gets 60%).
3. Scores fade with a 30-day half-life. Stored in `tasteStore` (top 1500 songs / 400 artists).
4. Feedback on every song's menu: "Not interested" and "Don't recommend <artist>" (undo from the same menu).
5. Home › Made for you (`src/lib/recommendations.ts`), rebuilt at most every 12 h (or Refresh):
   On Repeat (top-scored songs you know), Daily Mix 1-3 (one per favourite artist: your songs + more by them + similar artists), Fresh Finds (only artists you never played), Because you liked <song>.
6. Groq gets a one-line taste summary (top artists, genres, favourite songs, skipped artists) and suggests songs; each is looked up with the normal search and filtered. Without Groq, mixes use searches of your top artists / genres.
7. Autoplay (`src/lib/autoplay.ts`): 4 that flow from the current song (AI + your taste), 4 by artists you love, 2 discovery from Fresh Finds; never recently played, not-interested or blocked; max 2 per artist, no same artist twice in a row.
