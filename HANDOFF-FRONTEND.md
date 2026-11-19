# Handoff para el frontend (Cloudflare Pages)

Contexto y pasos para que tomes el frontend desde aquí. El backend ya está
desplegado y funcionando en AWS (EKS + RDS); solo falta desplegar el frontend
y conectarlo.

## Qué está hecho (backend, por mi parte)

- 6 microservicios en EKS (catalog, user, order, cart, wishlist, review) +
  un gateway Nginx que enruta `/api/<dominio>` a cada servicio.
- PostgreSQL en RDS con 6 bases y datos semilla (12 libros, 8 clientes de prueba).
- La API es pública por un LoadBalancer HTTP, y se expone por HTTPS con un
  Cloudflare Quick Tunnel (necesario porque el SPA es HTTPS y no puede llamar a
  HTTP: "mixed content").

## Cambios de código que metí (ya en la rama `main` del repo)

1. **Autenticación por Bearer token** (antes era cookie, que no funciona
   cross-site entre Pages y el backend):
   - El login devuelve `token` en el body.
   - El SPA lo guarda en `localStorage` y lo manda en `Authorization: Bearer`.
   - Archivos: `src/lib/authToken.js`, `src/lib/api.js`, `src/services/authService.js`.
2. **Pantallas nuevas de wishlist y reviews** (no existían en la UI):
   - `src/screens/WishlistScreen.jsx`, `src/components/BookReviews.jsx`,
     `src/services/wishlistService.js`, `src/services/reviewService.js`,
     `src/hooks/useWishlist.js`, `src/hooks/useReviews.js`.
   - Integradas en `src/screens/BookScreen.jsx` (reseñas + botón wishlist),
     `src/App.jsx` (ruta `/wishlist`) y `src/components/Header.jsx` (icono/enlace).
3. **URL del backend configurable en runtime** (sin recompilar):
   - `public/runtime-config.js` define `window.__BOOKSTORE_CONFIG__.apiBaseUrl`.
   - `src/config/env.js` la usa con prioridad sobre `VITE_API_BASE_URL`.
   - `index.html` carga ese archivo antes del bundle.

Haz `git pull` de `main` para tener todo esto.

## Lo que necesitas hacer tú (deploy del frontend)

### 1. Poner la URL HTTPS del backend

Ya está puesta en `frontend/public/runtime-config.js`:

```js
window.__BOOKSTORE_CONFIG__ = {
  apiBaseUrl: "https://feeds-belong-distributions-kidney.trycloudflare.com",
};
```

IMPORTANTE: esa URL del túnel es TEMPORAL. Cambia cada vez que se reinicia el
túnel o el Lab de AWS. Cuando eso pase, yo te paso la URL nueva y tú solo
actualizas esa línea y vuelves a desplegar (no hace falta rebuild si Pages
sirve el archivo tal cual, pero lo más simple es rebuild + deploy).

### 2. Build y deploy a Pages

```bash
cd frontend
export VITE_API_BASE_URL=/ VITE_API_PREFIX=/api VITE_CURRENCY_LOCALE=es-CO VITE_CURRENCY_CODE=COP
npm ci
npm run build
npx wrangler pages deploy dist --project-name bookstore-eafit
```

Si tu proyecto de Pages está conectado al repo de GitHub, basta con hacer push
a la rama que Pages observa y se redespliega solo; en ese caso define las
variables VITE_* en Settings > Environment variables del proyecto Pages.

### 3. Verificar en el navegador

Abre `https://bookstore-eafit.pages.dev` y prueba:
- Login con `synthetic.customer.0001@bookstore.test` (sin contraseña).
- Catálogo (las portadas son un placeholder; los libros no traen imagen real).
- Página de libro: dejar una reseña (aparece con tu nombre).
- Corazón: agregar a wishlist; verla en `/wishlist`.
- Carrito + compra: debe dar 201 y bajar el stock.

En DevTools > Network, las llamadas deben ir a la URL `https://...trycloudflare.com`
SIN error de "mixed content".

## Si algo falla

- **Login no entra / 401**: revisa en Network que la petición a `/api/auth/login`
  responde 200 con un `token`. Si da error de CORS, avísame: el backend permite
  el origen `https://bookstore-eafit.pages.dev`; si tu dominio de Pages es otro,
  tengo que cambiarlo en el cluster.
- **"mixed content" en consola**: el `apiBaseUrl` no es https o quedó apuntando
  al LoadBalancer http. Debe ser la URL `https://...trycloudflare.com`.
- **"Failed to fetch" / la URL del túnel no responde**: el túnel o el Lab se
  reiniciaron; pídeme la URL nueva.

## Datos del backend (referencia)

- API HTTPS (túnel actual): https://feeds-belong-distributions-kidney.trycloudflare.com
- Prefijo: /api
- Auth: Bearer token (en el body del login; el SPA ya lo maneja)
- Origen CORS permitido en el backend: https://bookstore-eafit.pages.dev
