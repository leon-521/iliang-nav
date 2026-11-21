FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++ vips-dev
COPY package*.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app

# 构建时注入提交号，便于核对线上跑的是哪个 commit：
#   docker build --build-arg GIT_REVISION=$(git rev-parse HEAD) -t iliang-nav-nav:latest .
ARG GIT_REVISION=unknown
LABEL org.opencontainers.image.revision=$GIT_REVISION

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/app/data/app.db
RUN apk add --no-cache vips
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts ./scripts
RUN mkdir -p /app/data /app/data/icons
EXPOSE 3000
CMD ["sh", "-c", "node scripts/migrate.mjs && node server.js"]
