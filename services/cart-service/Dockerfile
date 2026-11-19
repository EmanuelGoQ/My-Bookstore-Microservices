# Build context MUST be the repository root:
#   docker build -f services/cart-service/Dockerfile -t cart-service .
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE}

WORKDIR /app

COPY proto ./proto
COPY services/shared ./services/shared

COPY services/cart-service/package.json ./services/cart-service/package.json
WORKDIR /app/services/cart-service
RUN npm install --omit=dev

COPY services/cart-service/src ./src

RUN mkdir -p /usr/src/app/logs && chown -R node:node /usr/src/app/logs

ENV PROTO_DIR=/app/proto
USER node

CMD ["npm", "start"]
