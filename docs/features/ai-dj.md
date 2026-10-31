# SONIQ DJ (v1.6.0)

1. Home › Made for you › "SONIQ DJ" card. Endless radio in sets of 5 songs, built only from the listener's own data.
2. Sets rotate: Your favourites → New for you (Fresh Finds / AI discovery) → Throwback (loved but not played lately) → Right now (time-of-day mood). Falls back to favourites if a set is too thin.
3. Before each set starts, Groq writes 1-2 Hinglish lines for this listener (name, time, first songs, streak, taste). Without AI a personal template line is used.
4. Voice: the phone's text-to-speech, best installed Indian-English voice (enhanced first). Music is ducked to ~22% while it talks (`setDucked` in the engine). Built so a realistic cloud / self-hosted voice can replace it later (`src/player/djVoice.ts`).
5. The next set is prepared when the last song of the current set starts (autoplay hook), so there's no waiting.
6. Player shows "SONIQ DJ · <set>" and a "Switch it up" button (jumps to a different kind of set now). Playing anything the DJ didn't pick ends DJ mode.
7. Settings › "DJ talks between sets" turns the voice off (music only). The DJ is off for Jam guests.
