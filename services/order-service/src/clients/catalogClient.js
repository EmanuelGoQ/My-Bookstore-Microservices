import { loadProto, createGrpcClient, callUnary } from "@bookstore/shared";

// gRPC client to catalog-service. order-service uses it to resolve book price
// and display fields and to apply a best-effort stock decrement (Option B).
export const createCatalogClient = (target) => {
  const proto = loadProto("catalog.proto");
  const ServiceClient = proto.bookstore.catalog.v1.CatalogService;
  const client = createGrpcClient(ServiceClient, target);

  const getBooks = async (bookIds) => {
    const response = await callUnary(client, "GetBooks", { book_ids: bookIds });
    return (response.books ?? []).map((book) => ({
      bookId: book.book_id,
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      price: book.price,
      stock: Number(book.stock),
    }));
  };

  const decreaseStock = async (lines) => {
    const response = await callUnary(client, "DecreaseStock", {
      lines: lines.map((line) => ({ book_id: line.bookId, quantity: line.quantity })),
    });
    return {
      applied: Boolean(response.applied),
      failures: response.failures ?? [],
    };
  };

  return { getBooks, decreaseStock };
};
