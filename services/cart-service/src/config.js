import { loadConfig } from "@bookstore/shared";

export const config = loadConfig(
  ["httpApi", "accessLog", "database", "auth"],
  ({ parsePositiveInteger, requireVars }) => {
    requireVars(["CART_MAX_QUANTITY_PER_ITEM", "CATALOG_GRPC_TARGET"]);

    return {
      cart: Object.freeze({
        maxQuantityPerItem: parsePositiveInteger("CART_MAX_QUANTITY_PER_ITEM"),
      }),
      clients: Object.freeze({
        catalogTarget: process.env.CATALOG_GRPC_TARGET.trim(),
      }),
    };
  }
);
