import { AppError, setBehaviorEvent, events } from "@bookstore/shared";

import { config } from "../config.js";

const { EVENT_SOURCES, EVENT_TYPES, RESOURCE_TYPES } = events;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeBookId = (rawBookId) => {
  if (typeof rawBookId !== "string") {
    throw new AppError("book_id is invalid", 400, "INVALID_CART_ITEM");
  }
  const bookId = rawBookId.trim().toLowerCase();
  if (!UUID_PATTERN.test(bookId)) {
    throw new AppError("book_id is invalid", 400, "INVALID_CART_ITEM");
  }
  return bookId;
};

const normalizeQuantity = (rawQuantity) => {
  if (
    !Number.isInteger(rawQuantity) ||
    rawQuantity <= 0 ||
    rawQuantity > config.cart.maxQuantityPerItem
  ) {
    throw new AppError(
      `quantity must be an integer between 1 and ${config.cart.maxQuantityPerItem}`,
      400,
      "INVALID_CART_ITEM"
    );
  }
  return rawQuantity;
};

const disableResponseCaching = (res) => res.set("Cache-Control", "no-store");

export const createCartController = ({ cartRepository, catalogClient }) => {
  // Joins stored cart lines with live catalog data (price/title) via gRPC.
  const buildCartView = async (customerId) => {
    const items = await cartRepository.findItemsByCustomer(customerId);
    if (items.length === 0) {
      return { items: [], totalQuantity: 0, totalAmount: "0" };
    }

    const books = await catalogClient.getBooks(items.map((item) => item.book_id));
    const booksById = new Map(books.map((book) => [book.bookId, book]));

    let totalQuantity = 0;
    let totalAmount = 0;

    const detailedItems = items.map((item) => {
      const book = booksById.get(item.book_id);
      const unitPrice = book ? Number(book.price) : 0;
      const lineTotal = unitPrice * item.quantity;
      totalQuantity += item.quantity;
      totalAmount += lineTotal;

      return {
        bookId: item.book_id,
        isbn: book?.isbn ?? null,
        title: book?.title ?? null,
        author: book?.author ?? null,
        unitPrice: book ? book.price : null,
        quantity: item.quantity,
        lineTotal: book ? String(lineTotal) : null,
        available: Boolean(book),
      };
    });

    return { items: detailedItems, totalQuantity, totalAmount: String(totalAmount) };
  };

  const getCart = async (req, res) => {
    const cart = await buildCartView(req.auth.customerId);
    disableResponseCaching(res);
    res.status(200).json({ cart });
  };

  const addItem = async (req, res) => {
    const bookId = normalizeBookId(req.body?.book_id);
    const quantity = normalizeQuantity(req.body?.quantity);

    const book = await catalogClient.getBook(bookId);
    if (!book) {
      throw new AppError("Book is not available", 404, "BOOK_UNAVAILABLE");
    }

    await cartRepository.addItem({ customerId: req.auth.customerId, bookId, quantity });

    setBehaviorEvent(req, {
      eventType: EVENT_TYPES.ADD_TO_CART,
      eventSource: EVENT_SOURCES.HTTP,
      resourceType: RESOURCE_TYPES.BOOK,
      resourceId: bookId,
      isbn: book.isbn,
      quantity,
    });

    const cart = await buildCartView(req.auth.customerId);
    disableResponseCaching(res);
    res.status(201).json({ cart });
  };

  const updateItem = async (req, res) => {
    const bookId = normalizeBookId(req.params.bookId);
    const quantity = normalizeQuantity(req.body?.quantity);

    const updated = await cartRepository.setItemQuantity({
      customerId: req.auth.customerId,
      bookId,
      quantity,
    });

    if (!updated) {
      throw new AppError("The book is not in the cart", 404, "CART_ITEM_NOT_FOUND");
    }

    setBehaviorEvent(req, {
      eventType: EVENT_TYPES.CART_QUANTITY_CHANGED,
      eventSource: EVENT_SOURCES.HTTP,
      resourceType: RESOURCE_TYPES.BOOK,
      resourceId: bookId,
      quantity,
    });

    const cart = await buildCartView(req.auth.customerId);
    disableResponseCaching(res);
    res.status(200).json({ cart });
  };

  const removeItem = async (req, res) => {
    const bookId = normalizeBookId(req.params.bookId);

    const removed = await cartRepository.removeItem({
      customerId: req.auth.customerId,
      bookId,
    });

    if (!removed) {
      throw new AppError("The book is not in the cart", 404, "CART_ITEM_NOT_FOUND");
    }

    setBehaviorEvent(req, {
      eventType: EVENT_TYPES.REMOVE_FROM_CART,
      eventSource: EVENT_SOURCES.HTTP,
      resourceType: RESOURCE_TYPES.BOOK,
      resourceId: bookId,
    });

    const cart = await buildCartView(req.auth.customerId);
    disableResponseCaching(res);
    res.status(200).json({ cart });
  };

  const clearCart = async (req, res) => {
    await cartRepository.clearCart(req.auth.customerId);
    disableResponseCaching(res);
    res.status(204).send();
  };

  return { getCart, addItem, updateItem, removeItem, clearCart };
};
