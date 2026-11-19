import { loadConfig } from "@bookstore/shared";

export const config = loadConfig([
  "httpApi",
  "accessLog",
  "database",
  "auth",
  "grpcServer",
]);
