import express from "express";

export const createReviewRoutes = ({ reviewController, authenticate }) => {
  const router = express.Router();

  // Public: anyone can read the reviews of a book.
  router.get("/book/:bookId", reviewController.getReviewsByBook);

  // Authenticated: submit (create/update) and delete your own review.
  router.post("/", authenticate, reviewController.submitReview);
  router.delete("/:reviewId", authenticate, reviewController.deleteReview);

  return router;
};
