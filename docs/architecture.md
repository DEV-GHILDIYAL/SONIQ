# SONIQ Architecture

## Overview
Free, ad-free music player. Web app (Vite + React + TypeScript), static hosting (Vercel). No backend.

## Folder structure
```
src/
├── sources/        # Ek file = ek source adapter
│   ├── types.ts    # Track, MusicSource interface
│   ├── jamendo.ts
│   ├── archive.ts  # Internet Archive
│   ├── fma.ts      # Free Music Archive
│   ├── local.ts    # Browser file picker
│   └── registry.ts # sourceId -> adapter map
├── player/         # Audio engine + queue (sirf yahan <audio> control hota hai)
├── store/          # Zustand stores (player state, library, playlists)
├── components/     # UI (source ko directly import nahi karega)
└── lib/            # helpers (fetch wrapper, storage)
```

## Data flow
1. UI search box -> `registry.searchAll(query)` -> har source se `Track[]`.
2. User track click -> `player.play(track)`.
3. Player `track.source` ke adapter se `getStreamUrl(track)` leta hai.
4. Stream URL ko HTML5 `<audio>` mein set karke play.
5. Queue, shuffle, repeat sirf `player/` mein. Store sirf state rakhta hai.

## Rules
- UI kisi adapter ko direct import nahi karta. Sirf registry.
- Components `<audio>` element ko directly nahi chhuate.
- Sab network calls `lib/fetch.ts` ke through (timeout, error handling).
- Local playlists aur settings localStorage mein (IndexedDB local audio files ke liye).

## Persistence
- Playlists, recently played: localStorage (`soniq:*` keys)
- Local audio files: IndexedDB (File handle / Blob)
- API keys: `.env` (VITE_ prefix), kabhi commit nahi

## Hosting
- Vercel free tier, `main` branch pe auto deploy.
