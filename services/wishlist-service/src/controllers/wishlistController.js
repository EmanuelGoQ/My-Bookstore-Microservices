import { AppError, setBehaviorEvent, events } from "@bookstore/shared";

const { EVENT_SOURCES, EVENT_TYPES, RESOURCE_TYPES } = events;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeBookId = (rawBookId) => {
  if (typeof rawBookId !== "string") {
    throw new AppError("book_id is invalid", 400, "INVALID_WISHLIST_ITEM");
  }
  const bookId = rawBookId.trim().toLowerCase();
  if (!UUID_PATTERN.test(bookId)) {
    throw new AppError("book_id is invalid", 400, "INVALID_WISHLIST_ITEM");
  }
  return bookId;
};

const disableResponseCaching = (res) => res.set("Cache-Control", "no-store");

export const createWishlistController = ({ wishlistRepository, catalogClient }) => {
  const buildWishlistView = async (customerId) => {
    const items = await wishlistRepository.findItemsByCustomer(customerId);
    if (items.length === 0) {
      return { items: [] };
    }

    const books = await catalogClient.getBooks(items.map((item) => item.book_id));
    const booksById = new Map(books.map((book) => [book.bookId, book]));

    return {
      items: items.map((item) => {
        const book = booksById.get(item.book_id);
        return {
          bookId: item.book_id,
          isbn: book?.isbn ?? null,
          title: book?.title ?? null,
          author: book?.author ?? null,
          price: book?.price ?? null,
          available: Boolean(book),
          addedAt: item.created_at,
        };
      }),
    };
  };

  const getWishlist = async (req, res) => {
    const wishlist = await buildWishlistView(req.auth.customerId);
    disableResponseCaching(res);
    res.status(200).json({ wishlist });
  };

  const addItem = async (req, res) => {
    const bookId = normalizeBookId(req.body?.book_id);

    const book = await catalogClient.getBook(bookId);
    if (!book) {
      throw new AppError("Book is not available", 404, "BOOK_UNAVAILABLE");
    }

    await wishlistRepository.addItem({ customerId: req.auth.customerId, bookId });

    setBehaviorEvent(req, {
      eventType: EVENT_TYPES.WISHLIST_ADDED,
      eventSource: EVENT_SOURCES.HTTP,
      resourceType: RESOURCE_TYPES.BOOK,
      resourceId: bookId,
      isbn: book.isbn,
    });

    const wishlist = await buildWishlistView(req.auth.customerId);
    disableResponseCaching(res);
    res.status(201).json({ wishlist });
  };

  const removeItem = async (req, res) => {
    const bookId = normalizeBookId(req.params.bookId);

    const removed = await wishlistRepository.removeItem({
      customerId: req.auth.customerId,
      bookId,
    });

    if (!removed) {
      throw new AppError("The book is not in the wishlist", 404, "WISHLIST_ITEM_NOT_FOUND");
    }

    setBehaviorEvent(req, {
      eventType: EVENT_TYPES.WISHLIST_REMOVED,
      eventSource: EVENT_SOURCES.HTTP,
      resourceType: RESOURCE_TYPES.BOOK,
      resourceId: bookId,
    });

    const wishlist = await buildWishlistView(req.auth.customerId);
    disableResponseCaching(res);
    res.status(200).json({ wishlist });
  };

  return { getWishlist, addItem, removeItem };
};
