# Build context MUST be the repository root:
#   docker build -f services/user-service/Dockerfile -t user-service .
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE}

WORKDIR /app

COPY proto ./proto
COPY services/shared ./services/shared
RUN cd /app/services/shared && npm install --omit=dev

COPY services/user-service/package.json ./services/user-service/package.json
WORKDIR /app/services/user-service
RUN npm install --omit=dev

COPY services/user-service/src ./src

RUN mkdir -p /usr/src/app/logs && chown -R node:node /usr/src/app/logs

ENV PROTO_DIR=/app/proto
USER node

CMD ["npm", "start"]
