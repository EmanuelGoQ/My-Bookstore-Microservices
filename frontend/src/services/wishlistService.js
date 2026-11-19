import { wishlistEndpoints } from "../config/endpoints.js";
import { api } from "../lib/api.js";

const toWishlistItem = (raw) => ({
  bookId: raw.bookId,
  isbn: raw.isbn,
  title: raw.title,
  author: raw.author,
  price: raw.price === null ? null : Number(raw.price),
  available: raw.available,
  addedAt: raw.addedAt,
});

const toWishlist = (data) => (data.wishlist.items ?? []).map(toWishlistItem);

export const wishlistService = Object.freeze({
  list: async () => {
    const { data } = await api.get(wishlistEndpoints.list);
    return toWishlist(data);
  },

  add: async (bookId) => {
    const { data } = await api.post(wishlistEndpoints.items, { book_id: bookId });
    return toWishlist(data);
  },

  remove: async (bookId) => {
    const { data } = await api.delete(wishlistEndpoints.item(bookId));
    return toWishlist(data);
  },
});
