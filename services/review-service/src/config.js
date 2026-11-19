import { loadConfig } from "@bookstore/shared";

export const config = loadConfig(
  ["httpApi", "accessLog", "database", "auth"],
  ({ parsePositiveInteger, requireVars }) => {
    requireVars([
      "REVIEWS_MAX_BODY_LENGTH",
      "REVIEWS_DEFAULT_LIMIT",
      "REVIEWS_MAX_LIMIT",
      "CATALOG_GRPC_TARGET",
      "USER_GRPC_TARGET",
    ]);

    const defaultLimit = parsePositiveInteger("REVIEWS_DEFAULT_LIMIT");
    const maxLimit = parsePositiveInteger("REVIEWS_MAX_LIMIT");
    if (defaultLimit > maxLimit) {
      throw new Error("REVIEWS_DEFAULT_LIMIT cannot be greater than REVIEWS_MAX_LIMIT");
    }

    return {
      reviews: Object.freeze({
        maxBodyLength: parsePositiveInteger("REVIEWS_MAX_BODY_LENGTH"),
        defaultLimit,
        maxLimit,
      }),
      clients: Object.freeze({
        catalogTarget: process.env.CATALOG_GRPC_TARGET.trim(),
        userTarget: process.env.USER_GRPC_TARGET.trim(),
      }),
    };
  }
);
