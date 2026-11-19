import express from "express";

import { createBehaviorEvent } from "../controllers/eventController.js";

export const createEventRoutes = () => {
  const router = express.Router();
  router.post("/", createBehaviorEvent);
  return router;
};
