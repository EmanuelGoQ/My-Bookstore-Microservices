import { loadProto, createGrpcClient, callUnary } from "@bookstore/shared";

// gRPC client to catalog-service. review-service uses it to confirm the book
// being reviewed exists.
export const createCatalogClient = (target) => {
  const proto = loadProto("catalog.proto");
  const ServiceClient = proto.bookstore.catalog.v1.CatalogService;
  const client = createGrpcClient(ServiceClient, target);

  const getBook = async (bookId) => {
    const response = await callUnary(client, "GetBook", { book_id: bookId });
    if (!response.found) {
      return null;
    }
    return {
      bookId: response.book.book_id,
      isbn: response.book.isbn,
      title: response.book.title,
    };
  };

  return { getBook };
};
