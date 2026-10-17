# SONIQ server (personal use only)

Node + Express + yt-dlp. Searches YouTube and proxies audio to the SONIQ app.

| Endpoint | What |
|---|---|
| `GET /health` | `{ ok, ytdlp }` (no key) |
| `GET /search?q=...&limit=20` | `{ results: [{ id, title, artist, durationSec, artworkUrl }] }` |
| `GET /resolve?id=VIDEO_ID` | warms the stream cache, 404 if the video is gone |
| `GET /stream?id=VIDEO_ID` | audio bytes, supports `Range` (seeking) |

Auth: `x-api-key` header or `?key=` (must equal `API_KEY`).

## Run locally (Docker)

```bash
cd server
docker build -t soniq-server .
docker run -p 3000:3000 -e API_KEY=change-me soniq-server
curl localhost:3000/health
```

## Run on the phone (Termux) — works around YouTube blocking cloud IPs

```bash
pkg update && pkg install -y nodejs-lts python git
curl -L https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp -o $PREFIX/bin/yt-dlp
chmod +x $PREFIX/bin/yt-dlp
git clone https://github.com/DEV-GHILDIYAL/SONIQ.git && cd SONIQ/server
npm install --omit=dev
echo "some-long-random-string" > .api-key
bash termux-start.sh
```
App `.env`: `EXPO_PUBLIC_SONIQ_SERVER_URL=http://127.0.0.1:3000`, `EXPO_PUBLIC_SONIQ_SERVER_KEY=<.api-key>`.
Update yt-dlp when YouTube breaks: `yt-dlp -U`.

## Deploy on Render (free)

1. Push the repo. Render -> New -> Web Service -> this repo.
2. Root Directory: `server`, Runtime: **Docker**, Instance: Free.
3. Env var `API_KEY` = a long random string.
4. App `.env`: `EXPO_PUBLIC_SONIQ_SERVER_URL=https://<name>.onrender.com`, `EXPO_PUBLIC_SONIQ_SERVER_KEY=<API_KEY>`.

Free instances sleep after ~15 min idle: the first request after that takes ~1 min.

## If YouTube blocks the server (HTTP 429 / "Sign in to confirm you're not a bot")

Cloud IPs (Render, AWS) get bot-checked a lot. Options, best first:
- Run the same Docker image at home and expose it with Cloudflare Tunnel (free, residential IP).
- Set `YTDLP_COOKIES` to the cookies.txt content of a **throwaway** Google account.

## When it breaks

YouTube changes often. Redeploy (Render: Manual Deploy -> Clear cache & deploy) to pull the newest yt-dlp.
