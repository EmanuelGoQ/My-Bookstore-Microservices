import express from "express";

export const createWishlistRoutes = ({ wishlistController, authenticate }) => {
  const router = express.Router();

  router.get("/", authenticate, wishlistController.getWishlist);
  router.post("/items", authenticate, wishlistController.addItem);
  router.delete("/items/:bookId", authenticate, wishlistController.removeItem);

  return router;
};
