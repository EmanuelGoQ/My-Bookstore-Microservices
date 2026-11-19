import { Alert, Button, Card, Col, Row } from "react-bootstrap";
import { Link } from "react-router-dom";

import { useWishlist, useRemoveFromWishlist } from "../hooks/useWishlist.js";
import { formatCurrency } from "../utils/currency.js";

const WishlistScreen = () => {
  const { data: items = [], isPending, isError } = useWishlist();
  const removeFromWishlist = useRemoveFromWishlist();

  if (isError) {
    return <p role="alert">No fue posible cargar tu lista de deseos.</p>;
  }

  if (isPending) {
    return <p>Cargando...</p>;
  }

  if (items.length === 0) {
    return (
      <>
        <h2 className="mb-4">Mi lista de deseos</h2>
        <Alert variant="info">
          Tu lista de deseos está vacía. Agrega libros desde el catálogo.
        </Alert>
        <Link to="/">
          <Button variant="light">← Ir al Catálogo</Button>
        </Link>
      </>
    );
  }

  return (
    <>
      <h2 className="mb-4">Mi lista de deseos</h2>
      <Row>
        {items.map((item) => (
          <Col key={item.bookId} sm={12} md={6} lg={4} xl={3} className="mb-3">
            <Card className="p-3 rounded shadow-sm h-100">
              <Link to={`/book/${item.isbn}`}>
                <Card.Img
                  src="/book-placeholder.svg"
                  alt={`Portada de ${item.title}`}
                  variant="top"
                  style={{ height: "220px", objectFit: "cover" }}
                />
              </Link>
              <Card.Body className="d-flex flex-column">
                <Card.Title as="div" className="mb-1">
                  <strong>{item.title ?? "Libro no disponible"}</strong>
                </Card.Title>
                <Card.Text className="text-secondary small mb-2">
                  {item.author}
                </Card.Text>
                <Card.Text className="fw-semibold mb-3">
                  {item.price !== null ? formatCurrency(item.price) : "—"}
                </Card.Text>
                <Button
                  variant="outline-danger"
                  size="sm"
                  className="mt-auto"
                  disabled={removeFromWishlist.isPending}
                  onClick={() => removeFromWishlist.mutate(item.bookId)}
                >
                  Quitar de la lista
                </Button>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </>
  );
};

export default WishlistScreen;
