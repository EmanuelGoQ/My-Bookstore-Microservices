// wishlist-service owns the wishlist_items table in its own database.
export const createWishlistRepository = (pool) => {
  const findItemsByCustomer = async (customerId, executor = pool) => {
    const query = `
      SELECT book_id, created_at
      FROM wishlist_items
      WHERE customer_id = $1
      ORDER BY created_at DESC, book_id ASC
    `;
    const { rows } = await executor.query(query, [customerId]);
    return rows;
  };

  // Idempotent add: adding a book already on the wishlist is a no-op.
  const addItem = async ({ customerId, bookId }, executor = pool) => {
    const query = `
      INSERT INTO wishlist_items (customer_id, book_id)
      VALUES ($1, $2)
      ON CONFLICT (customer_id, book_id) DO NOTHING
      RETURNING book_id
    `;
    const { rows } = await executor.query(query, [customerId, bookId]);
    return rows[0] ?? null;
  };

  const removeItem = async ({ customerId, bookId }, executor = pool) => {
    const query = `
      DELETE FROM wishlist_items
      WHERE customer_id = $1 AND book_id = $2
      RETURNING book_id
    `;
    const { rows } = await executor.query(query, [customerId, bookId]);
    return rows[0] ?? null;
  };

  return { findItemsByCustomer, addItem, removeItem };
};
