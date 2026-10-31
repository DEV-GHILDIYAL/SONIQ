# Create with AI (v1.6.0)

1. Library › "Create with AI" (`/ai-playlist`). Type a vibe or tap a preset (Gym, Road trip, Late night, Study, Heartbreak, Barish, Party, 90s).
2. "Use my taste" (on by default) adds the listener's own taste summary to the prompt. Nobody else's data is used.
3. Groq returns a playlist name, a one-line description and 25 songs with short reasons (`askGroqPlaylist`). Each song is looked up with the normal search (3 at a time, progress shown), filtered (not interested / blocked artists) and de-duplicated, max 4 per artist.
4. Preview: play, remove a song, swap a song (AI suggests a new one), tweak the whole list ("More upbeat", "More Punjabi", or free text), rename, then "Save to library" (a private playlist; can be made public from its page).
5. Any of your playlists: "Add similar songs" adds up to 10 new songs that fit it (sampled from up to 20 of its songs).
6. Needs Groq. Errors are shown in plain words; nothing is saved until the user taps Save.
