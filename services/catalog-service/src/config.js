import { loadConfig } from "@bookstore/shared";

export const config = loadConfig(
  ["httpApi", "accessLog", "database", "grpcServer"],
  ({ parsePositiveInteger, requireVars }) => {
    requireVars(["BOOKS_DEFAULT_LIMIT", "BOOKS_MAX_LIMIT"]);

    const defaultLimit = parsePositiveInteger("BOOKS_DEFAULT_LIMIT");
    const maxLimit = parsePositiveInteger("BOOKS_MAX_LIMIT");

    if (defaultLimit > maxLimit) {
      throw new Error("BOOKS_DEFAULT_LIMIT cannot be greater than BOOKS_MAX_LIMIT");
    }

    return {
      books: Object.freeze({ defaultLimit, maxLimit }),
    };
  }
);
