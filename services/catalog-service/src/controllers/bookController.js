import { AppError, setBehaviorEvent, events } from "@bookstore/shared";

import { config } from "../config.js";

const { EVENT_SOURCES, EVENT_TYPES, RESOURCE_TYPES } = events;

const parseNonNegativeInteger = (rawValue, parameterName) => {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new AppError(
      `${parameterName} must be a non-negative integer`,
      400,
      "INVALID_QUERY_PARAMETER"
    );
  }
  return value;
};

export const createBookController = (bookRepository) => {
  const getBooks = async (req, res) => {
    const requestedLimit = req.query.limit
      ? parseNonNegativeInteger(req.query.limit, "limit")
      : config.books.defaultLimit;

    if (requestedLimit === 0 || requestedLimit > config.books.maxLimit) {
      throw new AppError(
        `limit must be between 1 and ${config.books.maxLimit}`,
        400,
        "INVALID_QUERY_PARAMETER"
      );
    }

    const offset = req.query.offset
      ? parseNonNegativeInteger(req.query.offset, "offset")
      : 0;

    const books = await bookRepository.findBooks({ limit: requestedLimit, offset });

    setBehaviorEvent(req, {
      eventType: EVENT_TYPES.CATALOG_VIEW,
      eventSource: EVENT_SOURCES.HTTP,
      resourceType: RESOURCE_TYPES.CATALOG,
    });

    res.status(200).json(books);
  };

  const getBookByIsbn = async (req, res) => {
    const isbn = req.params.isbn?.trim();
    if (!isbn) {
      throw new AppError("ISBN is required", 400, "INVALID_ISBN");
    }

    const book = await bookRepository.findBookByIsbn(isbn);
    if (!book) {
      throw new AppError("Book not found", 404, "BOOK_NOT_FOUND");
    }

    setBehaviorEvent(req, {
      eventType: EVENT_TYPES.BOOK_VIEW,
      eventSource: EVENT_SOURCES.HTTP,
      resourceType: RESOURCE_TYPES.BOOK,
      resourceId: book.book_id,
      isbn: book.isbn,
    });

    res.status(200).json(book);
  };

  return { getBooks, getBookByIsbn };
};
