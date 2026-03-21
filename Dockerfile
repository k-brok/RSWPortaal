# ── Build args (ingevuld door CI/CD) ──────────────────────────────
ARG APP_VERSION=dev
ARG GIT_SHA=local
ARG BUILD_DATE=unknown

# ── Build stage ───────────────────────────────────────────────────
FROM node:22-alpine AS base

WORKDIR /app

# Alleen package.json kopiëren voor layer-caching van npm install
COPY package*.json ./
RUN npm ci --omit=dev

# Broncode kopiëren (zonder node_modules en .env via .dockerignore)
COPY src/ ./src/
COPY public/ ./public/
COPY db/ ./db/

# ── Runtime ───────────────────────────────────────────────────────
FROM node:22-alpine

# ARGs opnieuw declareren zodat ze beschikbaar zijn in dit stage
ARG APP_VERSION=dev
ARG GIT_SHA=local
ARG BUILD_DATE=unknown

WORKDIR /app

COPY --from=base /app ./

# OCI-standaard image labels
LABEL org.opencontainers.image.title="RSW Portaal" \
      org.opencontainers.image.description="Regionale Scouting Wedstrijden — Regio De Langstraat" \
      org.opencontainers.image.vendor="CHUNKK" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}"

# Versie beschikbaar maken als ENV (zichtbaar in runtime logs)
ENV APP_VERSION=${APP_VERSION} \
    GIT_SHA=${GIT_SHA} \
    NODE_ENV=production

EXPOSE 3000

CMD ["node", "src/app.js"]
