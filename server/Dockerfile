# SONIQ backend: Node + yt-dlp (+ deno, which yt-dlp needs to solve YouTube's JS challenges).
FROM node:22-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip \
 && rm -rf /var/lib/apt/lists/*

# Latest yt-dlp standalone binary (no Python needed). Redeploy = newest yt-dlp.
RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
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
