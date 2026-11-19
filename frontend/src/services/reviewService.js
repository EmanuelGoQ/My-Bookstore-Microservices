import { reviewEndpoints } from "../config/endpoints.js";
import { api } from "../lib/api.js";

const toReview = (raw) => ({
  id: raw.reviewId,
  bookId: raw.bookId,
  rating: raw.rating,
  title: raw.title,
  body: raw.body,
  createdAt: raw.createdAt,
  reviewer: raw.reviewer
    ? { firstName: raw.reviewer.firstName, lastName: raw.reviewer.lastName }
    : null,
});

export const reviewService = Object.freeze({
  listByBook: async (bookId) => {
    const { data } = await api.get(reviewEndpoints.byBook(bookId));
    return (data.reviews ?? []).map(toReview);
  },

  create: async ({ bookId, rating, title, body }) => {
    const { data } = await api.post(reviewEndpoints.create, {
      book_id: bookId,
      rating,
      title,
      body,
    });
    return toReview(data.review);
  },
});
