# BookStore — Arquitectura de microservicios (EKS)

Reorganización del monolito `backend/` en seis microservicios Node.js
independientes, comunicados por **gRPC**, con **base de datos por servicio**,
expuestos por un **API Gateway / Ingress ALB**, y con persistencia del
clickstream mediante **Fluent Bit (DaemonSet) → Amazon S3**.

## Servicios

| Servicio            | Dominio / tablas          | REST (prefijo `/api`)                         | gRPC servidor         | gRPC cliente hacia        |
|---------------------|---------------------------|-----------------------------------------------|-----------------------|---------------------------|
| `catalog-service`   | `books`                   | `GET /books`, `GET /books/:isbn`, `POST /events` | `CatalogService`      | —                         |
| `user-service`      | `customers` + auth        | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` | `UserService`   | —                         |
| `order-service`     | `orders`, `order_items`   | `GET /orders`, `GET /orders/:id`, `POST /orders` | —                   | catalog, user             |
| `cart-service`      | `cart_items`              | `GET/POST/PATCH/DELETE /cart...`              | —                     | catalog                   |
| `wishlist-service`  | `wishlist_items`          | `GET/POST/DELETE /wishlist...`               | —                     | catalog                   |
| `review-service`    | `reviews`                 | `GET /reviews/book/:bookId`, `POST /reviews`, `DELETE /reviews/:id` | — | catalog, user         |

Topología gRPC confirmada: `order → catalog + user`, `cart → catalog`,
`wishlist → catalog`, `review → catalog + user`.

## Paquete compartido (`services/shared`)

Código común a todos los servicios para evitar duplicación y mantener un único
contrato de comportamiento:

- `config.js` — carga de configuración fail-fast por secciones.
- `logger.js` — logging operacional JSON a stdout.
- `database.js` — pool `pg` y `withTransaction` (uno por servicio).
- `auth.js` — emisión/verificación de JWT, `sessionContext`, `authenticate`.
- `accessLogger.js` + `clickstream.js` — generan la **línea de clickstream**
  (formato Apache/NCSA + sección de contexto `key=value`) a stdout y, opcional,
  a archivo. Es el contrato que parsea Fluent Bit.
- `events.js` — vocabulario canónico de eventos (schema del clickstream).
- `grpc.js` — carga de `.proto`, servidor y clientes gRPC.
- `httpApp.js` — ensamblado común del app Express.

## Contratos gRPC (`proto/`)

- `catalog.proto` → `CatalogService`: `GetBooks`, `GetBook`, `DecreaseStock`.
- `user.proto` → `UserService`: `GetCustomer`.

Los precios (`NUMERIC`) viajan como string para no perder precisión.

### Checkout sin transacción distribuida (Opción B)

`order-service.placeOrder`:

1. valida el cliente vía `UserService.GetCustomer` (gRPC);
2. resuelve precio/stock/campos de display vía `CatalogService.GetBooks` (gRPC);
3. reserva stock vía `CatalogService.DecreaseStock` (gRPC, *best-effort*);
4. persiste la orden localmente, **snapshoteando** `isbn/title/author/unit_price`
   en `order_items` (no hay FK ni JOIN al catálogo).

Se acepta el caso límite de que el stock se decremente y la persistencia falle
(sin compensación); es la simplicidad elegida de la Opción B.

## Base de datos por servicio (`databases/`)

Cada servicio tiene su propio esquema (`databases/<servicio>/schema.sql`) y, si
aplica, seed. No hay claves foráneas entre dominios: `orders.customer_id`,
`order_items.book_id`, `reviews.book_id`, `cart_items.book_id`, etc. referencian
ids que viven en otros servicios y se validan por gRPC. `databases/common/`
contiene el bootstrap de roles de mínimo privilegio y grants por base, siguiendo
el patrón RDS original.

## Despliegue en EKS (`k8s/`)

| Archivo                     | Contenido                                                        |
|-----------------------------|------------------------------------------------------------------|
| `00-namespace.yaml`         | Namespace `bookstore`                                            |
| `10-shared-config.yaml`     | ConfigMap común + Secrets (JWT, credenciales de BD)             |
| `20..25-*.yaml`             | Deployment + Service por microservicio (catalog/user exponen gRPC) |
| `30-frontend.yaml`          | SPA Nginx                                                        |
| `40-ingress-alb.yaml`       | **ALB Ingress**: enruta `/api/<dominio>` a cada servicio         |
| `50..52-fluent-bit-*.yaml`  | **Fluent Bit DaemonSet → S3** (SA/IRSA, config, daemonset)       |

Enrutado del ALB por path: `/api/auth → user`, `/api/books → catalog`,
`/api/cart → cart`, `/api/orders → order`, `/api/reviews → review`,
`/api/wishlist → wishlist`, `/api/events → catalog`, `/ → frontend`.

### Clickstream → S3

Cada servicio emite la línea de clickstream a **stdout**. El DaemonSet de Fluent
Bit lee `/var/log/containers/*_bookstore_*.log`, aplica un parser que reconoce
la línea NCSA (y descarta los logs JSON operacionales con un filtro `grep`), y
sube los registros a S3 particionados por fecha
(`/clickstream/year=/month=/day=/hour=/`). Requiere el AWS Load Balancer
Controller y un rol IAM (IRSA) con `s3:PutObject`.

## Desarrollo local

Con Docker (una Postgres con seis bases, todos los servicios y su gRPC):

```bash
docker compose -f compose.microservices.yaml up --build
```

Puertos locales: catalog 5001, user 5002, order 5003, cart 5004,
wishlist 5005, review 5006. Login de prueba (sin contraseña):
`synthetic.customer.0001@bookstore.test` … `0008`.

## Construcción de imágenes

El contexto de build **debe** ser la raíz del repositorio (para incluir
`services/shared` y `proto/`):

```bash
docker build -f services/catalog-service/Dockerfile -t catalog-service .
```
