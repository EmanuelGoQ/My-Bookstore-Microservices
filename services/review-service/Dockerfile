# Build context MUST be the repository root:
#   docker build -f services/review-service/Dockerfile -t review-service .
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE}

WORKDIR /app

COPY proto ./proto
COPY services/shared ./services/shared
RUN cd /app/services/shared && npm install --omit=dev

COPY services/review-service/package.json ./services/review-service/package.json
WORKDIR /app/services/review-service
RUN npm install --omit=dev

COPY services/review-service/src ./src

RUN mkdir -p /usr/src/app/logs && chown -R node:node /usr/src/app/logs

ENV PROTO_DIR=/app/proto
USER node

CMD ["npm", "start"]
