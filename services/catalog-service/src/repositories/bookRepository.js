const BOOK_COLUMNS = `
  book_id,
  isbn,
  title,
  author,
  description,
  category,
  publisher,
  publication_year,
  price,
  stock,
  image,
  created_at,
  updated_at
`;

export const createBookRepository = (pool) => {
  const findBooks = async ({ limit, offset }, executor = pool) => {
    const query = `
      SELECT ${BOOK_COLUMNS}
      FROM books
      WHERE deleted_at IS NULL
      ORDER BY title ASC
      LIMIT $1 OFFSET $2
    `;
    const { rows } = await executor.query(query, [limit, offset]);
    return rows;
  };

  const findBookByIsbn = async (isbn, executor = pool) => {
    const query = `
      SELECT ${BOOK_COLUMNS}
      FROM books
      WHERE isbn = $1
        AND deleted_at IS NULL
      LIMIT 1
    `;
    const { rows } = await executor.query(query, [isbn]);
    return rows[0] ?? null;
  };

  const findBooksByIds = async (bookIds, executor = pool) => {
    const query = `
      SELECT book_id, isbn, title, author, price, stock
      FROM books
      WHERE book_id = ANY($1::uuid[])
        AND deleted_at IS NULL
      ORDER BY book_id
    `;
    const { rows } = await executor.query(query, [bookIds]);
    return rows;
  };

  const findBookById = async (bookId, executor = pool) => {
    const query = `
      SELECT book_id, isbn, title, author, price, stock
      FROM books
      WHERE book_id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `;
    const { rows } = await executor.query(query, [bookId]);
    return rows[0] ?? null;
  };

  // Conditional, best-effort decrement (Option B). Returns the new stock, or
  // null when the row is missing or stock would go negative.
  const decreaseBookStock = async ({ bookId, quantity }, executor = pool) => {
    const query = `
      UPDATE books
      SET stock = stock - $2
      WHERE book_id = $1
        AND deleted_at IS NULL
        AND stock >= $2
      RETURNING stock
    `;
    const { rows } = await executor.query(query, [bookId, quantity]);
    return rows[0] ?? null;
  };

  return {
    findBooks,
    findBookByIsbn,
    findBooksByIds,
    findBookById,
    decreaseBookStock,
  };
};
