# Multi-stage build pra imagem pequena (~80MB)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache wget dumb-init && \
    addgroup -S app && adduser -S app -G app && \
    mkdir -p /uploads && chown -R app:app /uploads /app

COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app src ./src
COPY --chown=app:app package.json ./

USER app
EXPOSE 3000
ENV NODE_ENV=production

# dumb-init pra forward de signals (SIGTERM, etc)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
