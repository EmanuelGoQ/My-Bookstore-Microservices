# Build context MUST be the repository root:
#   docker build -f services/wishlist-service/Dockerfile -t wishlist-service .
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE}

WORKDIR /app

COPY proto ./proto
COPY services/shared ./services/shared

COPY services/wishlist-service/package.json ./services/wishlist-service/package.json
WORKDIR /app/services/wishlist-service
RUN npm install --omit=dev

COPY services/wishlist-service/src ./src

RUN mkdir -p /usr/src/app/logs && chown -R node:node /usr/src/app/logs

ENV PROTO_DIR=/app/proto
USER node

CMD ["npm", "start"]
