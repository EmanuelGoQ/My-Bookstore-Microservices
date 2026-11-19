import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

const PROTO_LOAD_OPTIONS = {
  // Keep field names as declared in the .proto (snake_case). All client/server
  // code refers to fields as snake_case (customer_id, book_ids, ...).
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

// The proto/ directory lives at the monorepo root and is copied into every
// service image at /app/proto (see each service Dockerfile).
const resolveProtoDir = () => {
  if (process.env.PROTO_DIR && process.env.PROTO_DIR.trim() !== "") {
    return process.env.PROTO_DIR.trim();
  }

  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "proto");
};

export const loadProto = (protoFile) => {
  const packageDefinition = protoLoader.loadSync(
    join(resolveProtoDir(), protoFile),
    PROTO_LOAD_OPTIONS
  );

  return grpc.loadPackageDefinition(packageDefinition);
};

// Starts a gRPC server exposing one or more service implementations.
// serviceDefinitions: array of { service, implementation }.
export const startGrpcServer = async ({ host, port, serviceDefinitions, logger }) => {
  const server = new grpc.Server();

  for (const { service, implementation } of serviceDefinitions) {
    server.addService(service, implementation);
  }

  const address = `${host}:${port}`;

  await new Promise((resolve, reject) => {
    server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  logger.info("gRPC server started", { address });
  return server;
};

export const stopGrpcServer = (server) =>
  new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.tryShutdown(() => resolve());
  });

// Builds an insecure gRPC client for a given service constructor and target.
export const createGrpcClient = (ServiceClient, target) =>
  new ServiceClient(target, grpc.credentials.createInsecure());

// Promisifies a unary gRPC client method with a per-call deadline.
export const callUnary = (client, method, request, { deadlineMs = 5000 } = {}) =>
  new Promise((resolve, reject) => {
    const deadline = new Date(Date.now() + deadlineMs);
    client[method](request, { deadline }, (error, response) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(response);
    });
  });

export { grpc };
