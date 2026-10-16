# SONIQ — Claude instructions

Free, ad-free music player. Vite + React + TypeScript (strict). No backend, Vercel static hosting.
Sources: Jamendo, Internet Archive, Free Music Archive, local files.

## Hard rules
1. Sirf free/licensed APIs. YouTube, yt-dlp ya scraping code kabhi nahi.
2. Har source `MusicSource` interface implement karega (`src/sources/types.ts`).
3. UI (`src/components/**`) kisi adapter ko directly import nahi karega. Sirf `@/sources/registry` aur `@/sources/types`.
4. Audio (`<audio>`, `HTMLAudioElement`, `new Audio()`) sirf `src/player/` mein.
5. API keys sirf `.env` mein, `VITE_` prefix ke saath. Code mein hardcode nahi. `.env` commit nahi.
6. Sab network calls `src/lib/fetch.ts` ke through.
7. Pura codebase scan mat karo. Jo file chahiye, uska path poochho ya seedha padho.
8. Naya feature: pehle 10-15 line spec (`docs/features/<name>.md`), approval ke baad code.
9. Jawab Hinglish mein, code aur comments English mein. Seedha, bina bhoomika.
10. Session end pe `docs/progress.md` ke liye 5 line summary do.

## Folder structure
```
src/
├── sources/     # ek file = ek adapter; types.ts, registry.ts
├── player/      # audio engine + queue (sirf yahan audio control)
├── store/       # Zustand stores (sirf state)
├── components/  # UI
└── lib/         # fetch wrapper, storage helpers
docs/
├── architecture.md  # data flow, rules, persistence
├── sources.md       # adapter contract + per-source API details
├── progress.md      # done / in progress / next
├── decisions.md     # one-line ADR log
└── features/        # feature specs
```

## Docs pointers
- Architecture aur data flow: `docs/architecture.md`
- `Track` / `MusicSource` contract aur source APIs: `docs/sources.md`
- Status: `docs/progress.md`
- Decisions: `docs/decisions.md`

## Commands
- `npm run dev` — dev server
- `npm run lint` / `npm run typecheck` / `npm test` / `npm run build` — sab pass hone chahiye before commit
- `npm run format` — Prettier
