-- review-service database: reviews
-- book_id and customer_id live in other services; validated via gRPC, no FK.
-- One active review per (book, customer): enforced by a partial unique index.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS reviews (
  review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title VARCHAR(180),
  body TEXT NOT NULL CHECK (BTRIM(body) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_active_book_customer
  ON reviews (book_id, customer_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_book_id ON reviews(book_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_reviews_set_updated_at ON reviews;
CREATE TRIGGER trg_reviews_set_updated_at
BEFORE UPDATE ON reviews
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
