export const authKeys = Object.freeze({
  currentUser: ["auth", "currentUser"],
});

export const bookKeys = Object.freeze({
  all: ["books"],
  list: () => [...bookKeys.all, "list"],
  detail: (isbn) => [...bookKeys.all, "detail", isbn],
});

export const orderKeys = Object.freeze({
  all: ["orders"],
  list: () => [...orderKeys.all, "list"],
  detail: (orderId) => [...orderKeys.all, "detail", orderId],
});

export const wishlistKeys = Object.freeze({
  all: ["wishlist"],
  list: () => [...wishlistKeys.all, "list"],
});

export const reviewKeys = Object.freeze({
  all: ["reviews"],
  byBook: (bookId) => [...reviewKeys.all, "book", bookId],
});
