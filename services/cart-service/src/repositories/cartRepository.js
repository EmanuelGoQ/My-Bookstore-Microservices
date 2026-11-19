// cart-service owns the cart_items table in its own database. A cart is simply
// the set of cart_items for a customer; there is no separate cart header row.
export const createCartRepository = (pool) => {
  const findItemsByCustomer = async (customerId, executor = pool) => {
    const query = `
      SELECT book_id, quantity, created_at, updated_at
      FROM cart_items
      WHERE customer_id = $1
      ORDER BY created_at ASC, book_id ASC
    `;
    const { rows } = await executor.query(query, [customerId]);
    return rows;
  };

  // Upsert: adding an existing book increments its quantity.
  const addItem = async ({ customerId, bookId, quantity }, executor = pool) => {
    const query = `
      INSERT INTO cart_items (customer_id, book_id, quantity)
      VALUES ($1, $2, $3)
      ON CONFLICT (customer_id, book_id)
      DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
      RETURNING book_id, quantity
    `;
    const { rows } = await executor.query(query, [customerId, bookId, quantity]);
    return rows[0];
  };

  const setItemQuantity = async ({ customerId, bookId, quantity }, executor = pool) => {
    const query = `
      UPDATE cart_items
      SET quantity = $3
      WHERE customer_id = $1 AND book_id = $2
      RETURNING book_id, quantity
    `;
    const { rows } = await executor.query(query, [customerId, bookId, quantity]);
    return rows[0] ?? null;
  };

  const removeItem = async ({ customerId, bookId }, executor = pool) => {
    const query = `
      DELETE FROM cart_items
      WHERE customer_id = $1 AND book_id = $2
      RETURNING book_id
    `;
    const { rows } = await executor.query(query, [customerId, bookId]);
    return rows[0] ?? null;
  };

  const clearCart = async (customerId, executor = pool) => {
    await executor.query(`DELETE FROM cart_items WHERE customer_id = $1`, [customerId]);
  };

  return { findItemsByCustomer, addItem, setItemQuantity, removeItem, clearCart };
};
