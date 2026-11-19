import express from "express";
import cors from "cors";

import { AppError } from "./errors/AppError.js";
import { createAccessLogger } from "./accessLogger.js";
import { notFoundHandler, createErrorHandler } from "./errorHandler.js";

// Assembles the common Express application shell shared by every service:
// trust-proxy, access/clickstream logging, session context, CORS allowlist,
// JSON body parsing, a /health endpoint, then the service's own routes, and
// finally the not-found + error terminal middleware. Middleware order matches
// the original monolith (accessLogger -> sessionContext -> cors -> json).
export const createHttpApp = ({
  config,
  logger,
  sessionContext,
  writeClickstreamLine,
  healthCheck,
  mountRoutes,
}) => {
  const app = express();

  const corsOptions = {
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.api.corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new AppError("Origin is not allowed by CORS policy", 403, "CORS_ORIGIN_DENIED"));
    },
  };

  const { middleware: accessLogger } = createAccessLogger({
    accessLog: config.accessLog,
    serviceName: config.app.serviceName,
    writeClickstreamLine,
  });

  app.set("trust proxy", config.http.trustProxyHops);
  app.disable("x-powered-by");

  app.use(accessLogger);
  app.use(sessionContext);
  app.use(cors(corsOptions));
  app.use(express.json({ limit: config.http.jsonBodyLimit }));

  app.get("/health", async (req, res) => {
    if (healthCheck) {
      await healthCheck();
    }
    res.status(200).json({ status: "ok", service: config.app.serviceName });
  });

  mountRoutes(app, `${config.api.basePath}`);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
};
