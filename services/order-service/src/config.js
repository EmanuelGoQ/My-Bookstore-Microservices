import { loadConfig } from "@bookstore/shared";

export const config = loadConfig(
  ["httpApi", "accessLog", "database", "auth"],
  ({ parsePositiveInteger, requireVars }) => {
    requireVars([
      "ORDERS_MAX_DISTINCT_ITEMS",
      "ORDERS_MAX_QUANTITY_PER_ITEM",
      "CATALOG_GRPC_TARGET",
      "USER_GRPC_TARGET",
    ]);

    return {
      orders: Object.freeze({
        maxDistinctItems: parsePositiveInteger("ORDERS_MAX_DISTINCT_ITEMS"),
        maxQuantityPerItem: parsePositiveInteger("ORDERS_MAX_QUANTITY_PER_ITEM"),
      }),
      clients: Object.freeze({
        catalogTarget: process.env.CATALOG_GRPC_TARGET.trim(),
        userTarget: process.env.USER_GRPC_TARGET.trim(),
      }),
    };
  }
);
