import express from "express";

export const createOrderRoutes = ({ orderController, authenticate }) => {
  const router = express.Router();

  router.get("/", authenticate, orderController.getOrders);
  router.get("/:orderId", authenticate, orderController.getOrderById);
  router.post("/", authenticate, orderController.createOrder);

  return router;
};
