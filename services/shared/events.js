// Canonical clickstream event vocabulary, shared by every microservice so the
// behavioral log schema stays consistent across the fleet. This mirrors the
// original monolith's config/events.js and is the contract Fluent Bit parses.

export const EVENT_SCHEMA_VERSION = 1;

export const EVENT_SOURCES = Object.freeze({
  HTTP: "http",
  CLIENT: "client",
});

export const EVENT_TYPES = Object.freeze({
  HOME_VIEW: "home_view",
  CATALOG_VIEW: "catalog_view",
  BOOK_VIEW: "book_view",
  SEARCH: "search",
  LOGIN: "login",
  LOGOUT: "logout",
  ADD_TO_CART: "add_to_cart",
  REMOVE_FROM_CART: "remove_from_cart",
  CART_QUANTITY_CHANGED: "cart_quantity_changed",
  CHECKOUT_STARTED: "checkout_started",
  PURCHASE: "purchase",
  WISHLIST_ADDED: "wishlist_added",
  WISHLIST_REMOVED: "wishlist_removed",
  REVIEW_SUBMITTED: "review_submitted",
  RECOMMENDATION_SHOWN: "recommendation_shown",
  RECOMMENDATION_CLICKED: "recommendation_clicked",
});

export const RESOURCE_TYPES = Object.freeze({
  BOOK: "book",
  CATALOG: "catalog",
  CUSTOMER: "customer",
  ORDER: "order",
  CART: "cart",
  WISHLIST: "wishlist",
  REVIEW: "review",
  SEARCH: "search",
});

export const CLIENT_EVENT_TYPES = Object.freeze([
  EVENT_TYPES.HOME_VIEW,
  EVENT_TYPES.SEARCH,
  EVENT_TYPES.ADD_TO_CART,
  EVENT_TYPES.REMOVE_FROM_CART,
  EVENT_TYPES.CART_QUANTITY_CHANGED,
  EVENT_TYPES.CHECKOUT_STARTED,
  EVENT_TYPES.RECOMMENDATION_SHOWN,
  EVENT_TYPES.RECOMMENDATION_CLICKED,
]);

export const EVENT_FIELD_LIMITS = Object.freeze({
  resourceType: 64,
  resourceId: 128,
  isbn: 20,
  recommendationId: 128,
  modelVersion: 128,
  experimentId: 128,
  searchQuery: 512,
  orderId: 128,
  position: 1000,
  quantity: 1000,
});
