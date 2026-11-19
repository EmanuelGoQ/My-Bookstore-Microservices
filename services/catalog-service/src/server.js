import {
  createLogger,
  createPool,
  verifyDatabaseConnection,
  closeDatabaseConnection,
  createClickstreamFileWriter,
  createAuth,
  createHttpApp,
  startGrpcServer,
  stopGrpcServer,
} from "@bookstore/shared";

import { config } from "./config.js";
import { createBookRepository } from "./repositories/bookRepository.js";
import { createBookController } from "./controllers/bookController.js";
import { createBookRoutes } from "./routes/bookRoutes.js";
import { createEventRoutes } from "./routes/eventRoutes.js";
import { createCatalogGrpcService } from "./grpc/catalogGrpcServer.js";

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

// catalog-service does not require auth on its public read endpoints, but it
// still parses the session cookie so authenticated clickstream lines carry the
// customer id. The shared auth needs JWT config; it is optional here.
const auth = config.auth
  ? createAuth(config.auth)
  : { sessionContext: (req, res, next) => next() };

const bookRepository = createBookRepository(pool);
const bookController = createBookController(bookRepository);

const app = createHttpApp({
  config,
  logger,
  sessionContext: auth.sessionContext,
  writeClickstreamLine: clickstream.writeLine,
  healthCheck: () => verifyDatabaseConnection(pool),
  mountRoutes: (expressApp, basePath) => {
    expressApp.use(`${basePath}/books`, createBookRoutes(bookController));
    expressApp.use(`${basePath}/events`, createEventRoutes());
  },
});

let httpServer;
let grpcServer;

const start = async () => {
  await verifyDatabaseConnection(pool);
  await clickstream.initialize();

  const catalogGrpcService = createCatalogGrpcService(bookRepository, logger);
  grpcServer = await startGrpcServer({
    host: config.grpcServer.host,
    port: config.grpcServer.port,
    serviceDefinitions: [catalogGrpcService],
    logger,
  });

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

  await stopGrpcServer(grpcServer);
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
