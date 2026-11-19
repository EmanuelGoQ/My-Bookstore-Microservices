import { withTransaction, AppError } from "@bookstore/shared";

import { ORDER_STATUSES } from "../config/orders.js";

const byBookId = (left, right) => left.bookId.localeCompare(right.bookId);

// placeOrder under Option B (no distributed transaction):
//  1. Validate the customer via user-service gRPC.
//  2. Resolve price + display fields + stock via catalog-service gRPC.
//  3. Reserve stock via catalog-service gRPC DecreaseStock (best-effort).
//  4. Persist order + items locally in a DB transaction, snapshotting
//     isbn/title/author/unit_price so reads never touch the catalog.
// If the local persistence fails after stock was decremented we log it; there
// is no compensating release (accepted trade-off of Option B).
export const createOrderService = ({ pool, orderRepository, catalogClient, userClient, logger }) => {
  const placeOrder = async ({ customerId, items }) => {
    const customer = await userClient.getCustomer(customerId);
    if (!customer) {
      throw new AppError("The authenticated customer no longer exists", 401, "INVALID_SESSION");
    }

    const orderedItems = [...items].sort(byBookId);
    const bookIds = orderedItems.map((item) => item.bookId);
    const books = await catalogClient.getBooks(bookIds);

    if (books.length !== orderedItems.length) {
      throw new AppError("One or more books are no longer available", 409, "BOOK_UNAVAILABLE");
    }

    const booksById = new Map(books.map((book) => [book.bookId, book]));

    for (const item of orderedItems) {
      const book = booksById.get(item.bookId);
      if (!book) {
        throw new AppError("One or more books are no longer available", 409, "BOOK_UNAVAILABLE");
      }
      if (book.stock < item.quantity) {
        throw new AppError(`Insufficient stock for ${book.title}`, 409, "INSUFFICIENT_STOCK");
      }
    }

    // Best-effort reservation against the catalog (Option B).
    const reservation = await catalogClient.decreaseStock(
      orderedItems.map((item) => ({ bookId: item.bookId, quantity: item.quantity }))
    );

    if (!reservation.applied) {
      throw new AppError(
        "Insufficient stock for one or more books",
        409,
        "INSUFFICIENT_STOCK"
      );
    }

    try {
      return await withTransaction(pool, async (client) => {
        const order = await orderRepository.createOrderRecord(
          { customerId, orderStatus: ORDER_STATUSES.PLACED },
          client
        );

        for (const item of orderedItems) {
          const book = booksById.get(item.bookId);
          await orderRepository.createOrderItem(
            {
              orderId: order.order_id,
              bookId: book.bookId,
              isbn: book.isbn,
              title: book.title,
              author: book.author,
              quantity: item.quantity,
              unitPrice: book.price,
            },
            client
          );
        }

        const placedOrder = await orderRepository.recalculateOrderTotal(order.order_id, client);
        const totalQuantity = orderedItems.reduce((total, item) => total + item.quantity, 0);

        return { ...placedOrder, total_quantity: totalQuantity };
      });
    } catch (error) {
      // Stock was already decremented in the catalog but the order could not be
      // persisted. Option B accepts this edge case; we record it for operators.
      logger.error("Order persistence failed after stock reservation", {
        customerId,
        error: error.message,
      });
      throw error;
    }
  };

  return { placeOrder };
};
