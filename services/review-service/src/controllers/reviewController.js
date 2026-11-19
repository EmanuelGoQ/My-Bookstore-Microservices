import { AppError, setBehaviorEvent, events } from "@bookstore/shared";

import { config } from "../config.js";

const { EVENT_SOURCES, EVENT_TYPES, RESOURCE_TYPES } = events;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuid = (rawValue, fieldName, code) => {
  if (typeof rawValue !== "string") {
    throw new AppError(`${fieldName} is invalid`, 400, code);
  }
  const value = rawValue.trim().toLowerCase();
  if (!UUID_PATTERN.test(value)) {
    throw new AppError(`${fieldName} is invalid`, 400, code);
  }
  return value;
};

const normalizeRating = (rawRating) => {
  if (!Number.isInteger(rawRating) || rawRating < 1 || rawRating > 5) {
    throw new AppError("rating must be an integer between 1 and 5", 400, "INVALID_REVIEW");
  }
  return rawRating;
};

const normalizeText = (rawValue, fieldName, maxLength, { required }) => {
  if (rawValue === undefined || rawValue === null) {
    if (required) {
      throw new AppError(`${fieldName} is required`, 400, "INVALID_REVIEW");
    }
    return null;
  }
  if (typeof rawValue !== "string") {
    throw new AppError(`${fieldName} must be a string`, 400, "INVALID_REVIEW");
  }
  const value = rawValue.trim();
  if (required && !value) {
    throw new AppError(`${fieldName} is required`, 400, "INVALID_REVIEW");
  }
  if (value.length > maxLength) {
    throw new AppError(`${fieldName} is too long`, 400, "INVALID_REVIEW");
  }
  return value || null;
};

const parseNonNegativeInteger = (rawValue, parameterName) => {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < 0) {
    throw new AppError(`${parameterName} must be a non-negative integer`, 400, "INVALID_QUERY_PARAMETER");
  }
  return value;
};

const disableResponseCaching = (res) => res.set("Cache-Control", "no-store");

export const createReviewController = ({ reviewRepository, catalogClient, userClient }) => {
  const toPublicReview = (review, reviewer) => ({
    reviewId: review.review_id,
    bookId: review.book_id,
    rating: review.rating,
    title: review.title,
    body: review.body,
    createdAt: review.created_at,
    reviewer: reviewer
      ? { firstName: reviewer.firstName, lastName: reviewer.lastName }
      : null,
  });

  const getReviewsByBook = async (req, res) => {
    const bookId = normalizeUuid(req.params.bookId, "bookId", "INVALID_BOOK_ID");

    const requestedLimit = req.query.limit
      ? parseNonNegativeInteger(req.query.limit, "limit")
      : config.reviews.defaultLimit;

    if (requestedLimit === 0 || requestedLimit > config.reviews.maxLimit) {
      throw new AppError(
        `limit must be between 1 and ${config.reviews.maxLimit}`,
        400,
        "INVALID_QUERY_PARAMETER"
      );
    }

    const offset = req.query.offset
      ? parseNonNegativeInteger(req.query.offset, "offset")
      : 0;

    const reviews = await reviewRepository.findReviewsByBookId({
      bookId,
      limit: requestedLimit,
      offset,
    });

    // Resolve reviewer display names via user-service gRPC (one call per
    // distinct customer). Failures degrade gracefully to a null reviewer.
    const uniqueCustomerIds = [...new Set(reviews.map((review) => review.customer_id))];
    const reviewersById = new Map();
    await Promise.all(
      uniqueCustomerIds.map(async (customerId) => {
        try {
          const reviewer = await userClient.getCustomer(customerId);
          if (reviewer) {
            reviewersById.set(customerId, reviewer);
          }
        } catch {
          // Leave reviewer unresolved on gRPC failure.
        }
      })
    );

    disableResponseCaching(res);
    res.status(200).json({
      reviews: reviews.map((review) =>
        toPublicReview(review, reviewersById.get(review.customer_id))
      ),
    });
  };

  const submitReview = async (req, res) => {
    const bookId = normalizeUuid(req.body?.book_id, "book_id", "INVALID_REVIEW");
    const rating = normalizeRating(req.body?.rating);
    const title = normalizeText(req.body?.title, "title", 180, { required: false });
    const body = normalizeText(req.body?.body, "body", config.reviews.maxBodyLength, {
      required: true,
    });

    const book = await catalogClient.getBook(bookId);
    if (!book) {
      throw new AppError("Book is not available", 404, "BOOK_UNAVAILABLE");
    }

    const review = await reviewRepository.upsertReview({
      bookId,
      customerId: req.auth.customerId,
      rating,
      title,
      body,
    });

    setBehaviorEvent(req, {
      eventType: EVENT_TYPES.REVIEW_SUBMITTED,
      eventSource: EVENT_SOURCES.HTTP,
      resourceType: RESOURCE_TYPES.REVIEW,
      resourceId: review.review_id,
      isbn: book.isbn,
    });

    disableResponseCaching(res);
    res.status(201).json({ review: toPublicReview(review, null) });
  };

  const deleteReview = async (req, res) => {
    const reviewId = normalizeUuid(req.params.reviewId, "reviewId", "INVALID_REVIEW_ID");

    const removed = await reviewRepository.softDeleteReview({
      reviewId,
      customerId: req.auth.customerId,
    });

    if (!removed) {
      throw new AppError("Review not found", 404, "REVIEW_NOT_FOUND");
    }

    disableResponseCaching(res);
    res.status(204).send();
  };

  return { getReviewsByBook, submitReview, deleteReview };
};
