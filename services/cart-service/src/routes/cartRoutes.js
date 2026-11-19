import express from "express";

export const createCartRoutes = ({ cartController, authenticate }) => {
  const router = express.Router();

  router.get("/", authenticate, cartController.getCart);
  router.post("/items", authenticate, cartController.addItem);
  router.patch("/items/:bookId", authenticate, cartController.updateItem);
  router.delete("/items/:bookId", authenticate, cartController.removeItem);
  router.delete("/", authenticate, cartController.clearCart);

  return router;
};
