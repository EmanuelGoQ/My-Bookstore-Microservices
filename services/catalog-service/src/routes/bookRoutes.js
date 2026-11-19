import express from "express";

export const createBookRoutes = (bookController) => {
  const router = express.Router();

  router.get("/", bookController.getBooks);
  router.get("/:isbn", bookController.getBookByIsbn);

  return router;
};
