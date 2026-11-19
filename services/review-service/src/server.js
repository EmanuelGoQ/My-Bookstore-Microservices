import {
  createLogger,
  createPool,
  verifyDatabaseConnection,
  closeDatabaseConnection,
  createClickstreamFileWriter,
  createAuth,
  createHttpApp,
} from "@bookstore/shared";

import { config } from "./config.js";
import { createReviewRepository } from "./repositories/reviewRepository.js";
import { createReviewController } from "./controllers/reviewController.js";
import { createReviewRoutes } from "./routes/reviewRoutes.js";
import { createCatalogClient } from "./clients/catalogClient.js";
import { createUserClient } from "./clients/userClient.js";

const logger = createLogger({
  serviceName: config.app.serviceName,
  environment: config.app.environment,
});

const pool = createPool(config.database);

const clickstream = createClickstreamFileWriter({
  enabled: config.clickstreamFile.enabled,
  path: config.clickstreamFile.path,
  logger,
});

const auth = createAuth(config.auth);
const catalogClient = createCatalogClient(config.clients.catalogTarget);
const userClient = createUserClient(config.clients.userTarget);
const reviewRepository = createReviewRepository(pool);
const reviewController = createReviewController({
  reviewRepository,
  catalogClient,
  userClient,
});

const app = createHttpApp({
  config,
  logger,
  sessionContext: auth.sessionContext,
  writeClickstreamLine: clickstream.writeLine,
  healthCheck: () => verifyDatabaseConnection(pool),
  mountRoutes: (expressApp, basePath) => {
    expressApp.use(
      `${basePath}/reviews`,
      createReviewRoutes({ reviewController, authenticate: auth.authenticate })
    );
  },
});

let httpServer;

const start = async () => {
  await verifyDatabaseConnection(pool);
  await clickstream.initialize();

  httpServer = app.listen(config.app.port, () => {
    logger.info("HTTP server started", { port: config.app.port });
  });
};

const shutdown = async (signal) => {
  logger.info("Shutdown requested", { signal });

  if (httpServer) {
    await new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await clickstream.close();
  await closeDatabaseConnection(pool);
  logger.info("Shutdown completed", { signal });
  process.exit(0);
};

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () =>
    shutdown(signal).catch((error) => {
      logger.error("Graceful shutdown failed", { error: error.message });
      process.exit(1);
    })
  );
}

start().catch((error) => {
  logger.error("Application failed to start", { error: error.message });
  process.exit(1);
});
