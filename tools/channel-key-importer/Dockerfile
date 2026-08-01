FROM node:24-alpine

WORKDIR /app

COPY --chown=node:node package.json ./package.json
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src

RUN mkdir -p /data && chown node:node /data

ENV CHANNEL_IMPORTER_NO_OPEN=1 \
    CHANNEL_IMPORTER_PORT=4179 \
    DATAEYESAI_DATA_DIR=/data \
    DATAEYESAI_HOST=0.0.0.0 \
    DATAEYESAI_STORAGE=sqlite

USER node

EXPOSE 4179

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:4179/ || exit 1

CMD ["node", "src/server.js"]
