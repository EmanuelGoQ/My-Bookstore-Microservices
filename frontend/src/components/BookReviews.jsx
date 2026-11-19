import { useState } from "react";
import { Alert, Button, Card, Form, ListGroup } from "react-bootstrap";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../hooks/useAuth.js";
import { useBookReviews, useCreateReview } from "../hooks/useReviews.js";

const Stars = ({ value }) => "★".repeat(value) + "☆".repeat(5 - value);

const reviewerName = (reviewer) =>
  reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : "Anónimo";

// Reviews block for a book detail page: lists existing reviews (public) and,
// for authenticated users, a form to submit one (review-service validates the
// book via gRPC to catalog and resolves the reviewer via gRPC to user).
const BookReviews = ({ bookId, isbn }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: reviews = [], isPending, isError } = useBookReviews(bookId);
  const createReview = useCreateReview(bookId);

  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [formError, setFormError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");

    if (!body.trim()) {
      setFormError("La reseña no puede estar vacía.");
      return;
    }

    try {
      await createReview.mutateAsync({ rating, title: title.trim() || null, body: body.trim() });
      setTitle("");
      setBody("");
      setRating(5);
    } catch (error) {
      setFormError(error.message);
    }
  };

  return (
    <section className="mt-5">
      <h4 className="mb-3">Reseñas</h4>

      {isError && <p role="alert">No fue posible cargar las reseñas.</p>}
      {isPending && <p>Cargando reseñas...</p>}

      {!isPending && !isError && reviews.length === 0 && (
        <Alert variant="light">Este libro aún no tiene reseñas.</Alert>
      )}

      {reviews.length > 0 && (
        <ListGroup variant="flush" className="mb-4">
          {reviews.map((review) => (
            <ListGroup.Item key={review.id}>
              <div className="d-flex justify-content-between">
                <strong>{review.title || "Reseña"}</strong>
                <span title={`${review.rating} de 5`}>
                  <Stars value={review.rating} />
                </span>
              </div>
              <p className="mb-1">{review.body}</p>
              <small className="text-secondary">
                por {reviewerName(review.reviewer)}
              </small>
            </ListGroup.Item>
          ))}
        </ListGroup>
      )}

      {user ? (
        <Card className="p-3">
          <Card.Title as="h5">Escribe una reseña</Card.Title>
          {formError && <Alert variant="danger">{formError}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-2" controlId="reviewRating">
              <Form.Label>Calificación</Form.Label>
              <Form.Select
                value={rating}
                onChange={(e) => setRating(Number.parseInt(e.target.value, 10))}
              >
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>{n} estrellas</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-2" controlId="reviewTitle">
              <Form.Label>Título (opcional)</Form.Label>
              <Form.Control
                type="text"
                maxLength={180}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Form.Group>
            <Form.Group className="mb-3" controlId="reviewBody">
              <Form.Label>Tu reseña</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                maxLength={4000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </Form.Group>
            <Button type="submit" disabled={createReview.isPending}>
              {createReview.isPending ? "Enviando..." : "Publicar reseña"}
            </Button>
          </Form>
        </Card>
      ) : (
        <Alert variant="light">
          <Button variant="link" className="p-0" onClick={() => navigate("/login", { state: { from: `/book/${isbn}` } })}>
            Inicia sesión
          </Button>{" "}
          para dejar una reseña.
        </Alert>
      )}
    </section>
  );
};

export default BookReviews;
