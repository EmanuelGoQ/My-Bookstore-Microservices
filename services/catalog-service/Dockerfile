# Build context MUST be the repository root so the shared package and the proto
# directory are available:
#   docker build -f services/catalog-service/Dockerfile -t catalog-service .
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE}

WORKDIR /app

# gRPC proto contracts, resolved by @bookstore/shared at /app/proto
COPY proto ./proto

# Shared package first (it is a file: dependency of the service)
COPY services/shared ./services/shared

RUN cd /app/services/shared && npm install --omit=dev

# Service manifest, install with the shared package linked
COPY services/catalog-service/package.json ./services/catalog-service/package.json
WORKDIR /app/services/catalog-service
RUN npm install --omit=dev

# Service source
COPY services/catalog-service/src ./src

# Writable logs directory (optional clickstream file sink)
RUN mkdir -p /usr/src/app/logs && chown -R node:node /usr/src/app/logs

ENV PROTO_DIR=/app/proto
USER node

CMD ["npm", "start"]
