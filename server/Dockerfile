# SONIQ backend: Node + yt-dlp (+ deno, which yt-dlp needs to solve YouTube's JS challenges).
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip python3 \
 && rm -rf /var/lib/apt/lists/*

# Latest yt-dlp zipapp (runs on python3). Starts fast, unlike the self-extracting
# yt-dlp_linux binary, which is very slow on Render's 0.1 CPU. Redeploy = newest yt-dlp.
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp

# Deno: JS runtime yt-dlp uses for YouTube's n/sig challenges.
RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.js ./

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "index.js"]
