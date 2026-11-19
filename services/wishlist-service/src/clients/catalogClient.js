import { loadProto, createGrpcClient, callUnary } from "@bookstore/shared";

// gRPC client to catalog-service. wishlist-service uses it to confirm a book
// exists and to enrich wishlist lines with current display fields and price.
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
      author: response.book.author,
      price: response.book.price,
    };
  };

  const getBooks = async (bookIds) => {
    if (bookIds.length === 0) {
      return [];
    }
    const response = await callUnary(client, "GetBooks", { book_ids: bookIds });
    return (response.books ?? []).map((book) => ({
      bookId: book.book_id,
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      price: book.price,
    }));
  };

  return { getBook, getBooks };
};
