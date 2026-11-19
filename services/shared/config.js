import "dotenv/config";

// Shared, fail-fast configuration loader. Each service calls loadConfig() with
// the set of sections it needs. Values always come from environment variables;
// nothing is hard-coded, and startup throws if anything required is missing.

const requireVars = (names) => {
  const missing = names.filter(
    (name) => process.env[name] === undefined || process.env[name].trim() === ""
  );

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
};

const parsePositiveInteger = (name) => {
  const value = Number.parseInt(process.env[name], 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
};

const parseNonNegativeInteger = (name) => {
  const value = Number.parseInt(process.env[name], 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
};

const parseBoolean = (name) => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(`${name} is required`);
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${name} must be either true or false`);
};

const parseCsv = (name) =>
  process.env[name]
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const loadApp = () => {
  requireVars(["NODE_ENV", "SERVICE_NAME", "PORT"]);

  const allowed = new Set(["development", "test", "production"]);
  const environment = process.env.NODE_ENV.trim();
  if (!allowed.has(environment)) {
    throw new Error("NODE_ENV must be development, test, or production");
  }

  return Object.freeze({
    environment,
    serviceName: process.env.SERVICE_NAME.trim(),
    port: parsePositiveInteger("PORT"),
  });
};

const loadHttpApi = () => {
  requireVars([
    "API_BASE_PATH",
    "CORS_ORIGINS",
    "HTTP_TRUST_PROXY_HOPS",
    "HTTP_JSON_BODY_LIMIT",
  ]);

  const apiBasePath = process.env.API_BASE_PATH.trim();
  if (!apiBasePath.startsWith("/")) {
    throw new Error("API_BASE_PATH must start with '/'");
  }

  const corsOrigins = parseCsv("CORS_ORIGINS");
  if (corsOrigins.length === 0) {
    throw new Error("CORS_ORIGINS must contain at least one origin");
  }

  const jsonBodyLimit = process.env.HTTP_JSON_BODY_LIMIT.trim().toLowerCase();
  if (!/^\d+(b|kb|mb)$/.test(jsonBodyLimit)) {
    throw new Error("HTTP_JSON_BODY_LIMIT must use a size such as 32768b, 32kb, or 1mb");
  }

  return {
    api: Object.freeze({
      basePath: apiBasePath.replace(/\/$/, ""),
      corsOrigins: Object.freeze(corsOrigins),
    }),
    http: Object.freeze({
      trustProxyHops: parseNonNegativeInteger("HTTP_TRUST_PROXY_HOPS"),
      jsonBodyLimit,
    }),
  };
};

const loadAccessLog = () => {
  requireVars([
    "ACCESS_LOG_ENABLED",
    "ACCESS_LOG_EXCLUDE_PATHS",
    "ACCESS_LOG_MAX_FIELD_LENGTH",
    "ACCESS_LOG_REQUEST_ID_HEADER",
    "CLICKSTREAM_FILE_ENABLED",
    "CLICKSTREAM_FILE_PATH",
  ]);

  const excludedPaths = parseCsv("ACCESS_LOG_EXCLUDE_PATHS");
  if (excludedPaths.length === 0 || excludedPaths.some((p) => !p.startsWith("/"))) {
    throw new Error("ACCESS_LOG_EXCLUDE_PATHS must be non-empty paths starting with '/'");
  }

  const requestIdHeader = process.env.ACCESS_LOG_REQUEST_ID_HEADER.trim();
  if (!/^[A-Za-z0-9-]+$/.test(requestIdHeader)) {
    throw new Error("ACCESS_LOG_REQUEST_ID_HEADER contains invalid characters");
  }

  const clickstreamFileEnabled = parseBoolean("CLICKSTREAM_FILE_ENABLED");
  const clickstreamFilePath = process.env.CLICKSTREAM_FILE_PATH.trim();
  if (clickstreamFileEnabled && !clickstreamFilePath.startsWith("/")) {
    throw new Error("CLICKSTREAM_FILE_PATH must be absolute when file logging is enabled");
  }

  return {
    accessLog: Object.freeze({
      enabled: parseBoolean("ACCESS_LOG_ENABLED"),
      excludedPaths: Object.freeze(excludedPaths),
      maxFieldLength: parsePositiveInteger("ACCESS_LOG_MAX_FIELD_LENGTH"),
      requestIdHeader,
    }),
    clickstreamFile: Object.freeze({
      enabled: clickstreamFileEnabled,
      path: clickstreamFilePath,
    }),
  };
};

const loadDatabase = () => {
  requireVars([
    "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD",
    "DB_SSL", "DB_SSL_REJECT_UNAUTHORIZED",
    "DB_POOL_MAX", "DB_IDLE_TIMEOUT_MS", "DB_CONNECTION_TIMEOUT_MS",
  ]);

  return Object.freeze({
    host: process.env.DB_HOST.trim(),
    port: parsePositiveInteger("DB_PORT"),
    name: process.env.DB_NAME.trim(),
    user: process.env.DB_USER.trim(),
    password: process.env.DB_PASSWORD,
    ssl: parseBoolean("DB_SSL"),
    sslRejectUnauthorized: parseBoolean("DB_SSL_REJECT_UNAUTHORIZED"),
    poolMax: parsePositiveInteger("DB_POOL_MAX"),
    idleTimeoutMs: parsePositiveInteger("DB_IDLE_TIMEOUT_MS"),
    connectionTimeoutMs: parsePositiveInteger("DB_CONNECTION_TIMEOUT_MS"),
  });
};

const loadAuth = () => {
  requireVars([
    "AUTH_JWT_SECRET", "AUTH_JWT_ALGORITHM", "AUTH_JWT_ISSUER",
    "AUTH_JWT_AUDIENCE", "AUTH_TOKEN_TTL_SECONDS",
    "AUTH_COOKIE_NAME", "AUTH_COOKIE_SECURE",
    "AUTH_COOKIE_SAME_SITE", "AUTH_COOKIE_PATH",
  ]);

  const secret = process.env.AUTH_JWT_SECRET;
  if (secret.length < 32) {
    throw new Error("AUTH_JWT_SECRET must contain at least 32 characters");
  }

  const algorithm = process.env.AUTH_JWT_ALGORITHM.trim();
  if (algorithm !== "HS256") {
    throw new Error("AUTH_JWT_ALGORITHM must be HS256");
  }

  const allowedSameSite = new Set(["lax", "strict", "none"]);
  const sameSite = process.env.AUTH_COOKIE_SAME_SITE.trim().toLowerCase();
  if (!allowedSameSite.has(sameSite)) {
    throw new Error("AUTH_COOKIE_SAME_SITE must be lax, strict, or none");
  }

  const secure = parseBoolean("AUTH_COOKIE_SECURE");
  if (sameSite === "none" && !secure) {
    throw new Error("AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE is none");
  }

  const cookiePath = process.env.AUTH_COOKIE_PATH.trim();
  if (!cookiePath.startsWith("/")) {
    throw new Error("AUTH_COOKIE_PATH must start with '/'");
  }

  return Object.freeze({
    jwt: Object.freeze({
      secret,
      algorithm,
      issuer: process.env.AUTH_JWT_ISSUER.trim(),
      audience: process.env.AUTH_JWT_AUDIENCE.trim(),
      ttlSeconds: parsePositiveInteger("AUTH_TOKEN_TTL_SECONDS"),
    }),
    cookie: Object.freeze({
      name: process.env.AUTH_COOKIE_NAME.trim(),
      httpOnly: true,
      secure,
      sameSite,
      path: cookiePath,
    }),
  });
};

const loadGrpcServer = () => {
  requireVars(["GRPC_HOST", "GRPC_PORT"]);
  return Object.freeze({
    host: process.env.GRPC_HOST.trim(),
    port: parsePositiveInteger("GRPC_PORT"),
  });
};

// sections: array naming which config blocks to load. Supported:
// "httpApi", "accessLog", "database", "auth", "grpcServer".
// extra: optional callback receiving the raw helpers to load service-specific vars.
export const loadConfig = (sections = [], extra) => {
  const config = { app: loadApp() };

  if (sections.includes("httpApi")) Object.assign(config, loadHttpApi());
  if (sections.includes("accessLog")) Object.assign(config, loadAccessLog());
  if (sections.includes("database")) config.database = loadDatabase();
  if (sections.includes("auth")) config.auth = loadAuth();
  if (sections.includes("grpcServer")) config.grpcServer = loadGrpcServer();

  if (typeof extra === "function") {
    Object.assign(config, extra({
      parsePositiveInteger,
      parseNonNegativeInteger,
      parseBoolean,
      parseCsv,
      requireVars,
    }));
  }

  return Object.freeze(config);
};
