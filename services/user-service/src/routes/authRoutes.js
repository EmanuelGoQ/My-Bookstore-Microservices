import express from "express";

export const createAuthRoutes = ({ authController, authenticate }) => {
  const router = express.Router();

  router.post("/login", authController.login);
  router.get("/me", authenticate, authController.getCurrentUser);
  router.post("/logout", authController.logout);

  return router;
};
