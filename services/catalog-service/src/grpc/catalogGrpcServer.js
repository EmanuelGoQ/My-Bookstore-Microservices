import { loadProto, grpc } from "@bookstore/shared";

// Implements the CatalogService gRPC contract (proto/catalog.proto) backed by
// the book repository. prices are returned as strings to preserve NUMERIC.
export const createCatalogGrpcService = (bookRepository, logger) => {
  const proto = loadProto("catalog.proto");
  const serviceDefinition = proto.bookstore.catalog.v1.CatalogService.service;

  const toGrpcBook = (book) => ({
    book_id: book.book_id,
    isbn: book.isbn,
    title: book.title,
    author: book.author ?? "",
    price: String(book.price),
    stock: Number(book.stock),
  });

  const implementation = {
    GetBooks: async (call, callback) => {
      try {
        const bookIds = call.request.book_ids ?? [];
        if (bookIds.length === 0) {
          callback(null, { books: [] });
          return;
        }
        const books = await bookRepository.findBooksByIds(bookIds);
        callback(null, { books: books.map(toGrpcBook) });
      } catch (error) {
        logger.error("gRPC GetBooks failed", { error: error.message });
        callback({ code: grpc.status.INTERNAL, message: "GetBooks failed" });
      }
    },

    GetBook: async (call, callback) => {
      try {
        const book = await bookRepository.findBookById(call.request.book_id);
        if (!book) {
          callback(null, { found: false, book: null });
          return;
        }
        callback(null, { found: true, book: toGrpcBook(book) });
      } catch (error) {
        logger.error("gRPC GetBook failed", { error: error.message });
        callback({ code: grpc.status.INTERNAL, message: "GetBook failed" });
      }
    },

    // Best-effort decrement (Option B): each line applied independently; a
    // failed line is reported but does not roll back the others.
    DecreaseStock: async (call, callback) => {
      try {
        const lines = call.request.lines ?? [];
        const failures = [];

        for (const line of lines) {
          const result = await bookRepository.decreaseBookStock({
            bookId: line.book_id,
            quantity: Number(line.quantity),
          });

          if (!result) {
            failures.push({ book_id: line.book_id, reason: "INSUFFICIENT_STOCK" });
          }
        }

        callback(null, { applied: failures.length === 0, failures });
      } catch (error) {
        logger.error("gRPC DecreaseStock failed", { error: error.message });
        callback({ code: grpc.status.INTERNAL, message: "DecreaseStock failed" });
      }
    },
  };

  return { service: serviceDefinition, implementation };
};
