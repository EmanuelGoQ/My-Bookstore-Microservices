import { loadConfig } from "@bookstore/shared";

export const config = loadConfig(
  ["httpApi", "accessLog", "database", "auth"],
  ({ requireVars }) => {
    requireVars(["CATALOG_GRPC_TARGET"]);

    return {
      clients: Object.freeze({
        catalogTarget: process.env.CATALOG_GRPC_TARGET.trim(),
      }),
    };
  }
);
