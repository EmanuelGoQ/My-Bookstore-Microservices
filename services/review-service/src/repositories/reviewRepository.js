// review-service owns the reviews table in its own database. A review
// references a book_id and customer_id that live in other services; there is no
// FK across databases, so those ids are validated via gRPC at write time.
export const createReviewRepository = (pool) => {
  const findReviewsByBookId = async ({ bookId, limit, offset }, executor = pool) => {
    const query = `
      SELECT review_id, book_id, customer_id, rating, title, body, created_at
      FROM reviews
      WHERE book_id = $1
        AND deleted_at IS NULL
      ORDER BY created_at DESC, review_id DESC
      LIMIT $2 OFFSET $3
    `;
    const { rows } = await executor.query(query, [bookId, limit, offset]);
    return rows;
  };

  const findReviewById = async (reviewId, executor = pool) => {
    const query = `
      SELECT review_id, book_id, customer_id, rating, title, body, created_at
      FROM reviews
      WHERE review_id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `;
    const { rows } = await executor.query(query, [reviewId]);
    return rows[0] ?? null;
  };

  // One review per customer per book: a second submission updates the first.
  const upsertReview = async ({ bookId, customerId, rating, title, body }, executor = pool) => {
    const query = `
      INSERT INTO reviews (book_id, customer_id, rating, title, body)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (book_id, customer_id) WHERE deleted_at IS NULL
      DO UPDATE SET rating = EXCLUDED.rating, title = EXCLUDED.title, body = EXCLUDED.body
      RETURNING review_id, book_id, customer_id, rating, title, body, created_at
    `;
    const { rows } = await executor.query(query, [bookId, customerId, rating, title, body]);
    return rows[0];
  };

  const softDeleteReview = async ({ reviewId, customerId }, executor = pool) => {
    const query = `
      UPDATE reviews
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE review_id = $1
        AND customer_id = $2
        AND deleted_at IS NULL
      RETURNING review_id
    `;
    const { rows } = await executor.query(query, [reviewId, customerId]);
    return rows[0] ?? null;
  };

  return { findReviewsByBookId, findReviewById, upsertReview, softDeleteReview };
};
