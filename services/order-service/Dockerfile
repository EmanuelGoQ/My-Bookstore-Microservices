# Build context MUST be the repository root:
#   docker build -f services/order-service/Dockerfile -t order-service .
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE}

WORKDIR /app

COPY proto ./proto
COPY services/shared ./services/shared

COPY services/order-service/package.json ./services/order-service/package.json
WORKDIR /app/services/order-service
RUN npm install --omit=dev

COPY services/order-service/src ./src

RUN mkdir -p /usr/src/app/logs && chown -R node:node /usr/src/app/logs

ENV PROTO_DIR=/app/proto
USER node

CMD ["npm", "start"]
