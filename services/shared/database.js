import pg from "pg";

const { Pool } = pg;

// Creates an isolated pg Pool per service. In the database-per-service model
// each microservice owns its own PostgreSQL database and least-privilege role,
// so there is no shared pool across services.
export const createPool = (databaseConfig) =>
  new Pool({
    host: databaseConfig.host,
    port: databaseConfig.port,
    database: databaseConfig.name,
    user: databaseConfig.user,
    password: databaseConfig.password,
    ssl: databaseConfig.ssl
      ? { rejectUnauthorized: databaseConfig.sslRejectUnauthorized }
      : false,
    max: databaseConfig.poolMax,
    idleTimeoutMillis: databaseConfig.idleTimeoutMs,
    connectionTimeoutMillis: databaseConfig.connectionTimeoutMs,
  });

export const withTransaction = async (pool, operation) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original transactional error.
    }

    throw error;
  } finally {
    client.release();
  }
};

export const verifyDatabaseConnection = async (pool) => {
  await pool.query("SELECT 1");
};

export const closeDatabaseConnection = async (pool) => {
  await pool.end();
};
