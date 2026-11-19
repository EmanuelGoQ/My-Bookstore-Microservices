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
import { createCustomerRepository } from "./repositories/customerRepository.js";
import { createAuthController } from "./controllers/authController.js";
import { createAuthRoutes } from "./routes/authRoutes.js";
import { createUserGrpcService } from "./grpc/userGrpcServer.js";

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
const customerRepository = createCustomerRepository(pool);
const authController = createAuthController({
  customerRepository,
  createSessionToken: auth.createSessionToken,
});

const app = createHttpApp({
  config,
  logger,
  sessionContext: auth.sessionContext,
  writeClickstreamLine: clickstream.writeLine,
  healthCheck: () => verifyDatabaseConnection(pool),
  mountRoutes: (expressApp, basePath) => {
    expressApp.use(
      `${basePath}/auth`,
      createAuthRoutes({ authController, authenticate: auth.authenticate })
    );
  },
});

let httpServer;
let grpcServer;

const start = async () => {
  await verifyDatabaseConnection(pool);
  await clickstream.initialize();

  const userGrpcService = createUserGrpcService(customerRepository, logger);
  grpcServer = await startGrpcServer({
    host: config.grpcServer.host,
    port: config.grpcServer.port,
    serviceDefinitions: [userGrpcService],
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
