# ── Build stage ───────────────────────────────────────────────────
FROM node:22-alpine AS base

WORKDIR /app

# Alleen package.json kopiëren voor layer-caching van npm install
COPY package*.json ./
RUN npm ci --omit=dev

# Broncode kopiëren (zonder node_modules en .env via .dockerignore)
COPY src/ ./src/
COPY public/ ./public/

# ── Runtime ───────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

COPY --from=base /app ./

# Poort die de app gebruikt
EXPOSE 3000

# Omgeving instellen (kan worden overschreven via docker-compose / k8s)
ENV NODE_ENV=production

CMD ["node", "src/app.js"]
