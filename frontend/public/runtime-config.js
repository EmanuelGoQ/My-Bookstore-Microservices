// Runtime configuration, served as a static file (NOT bundled). It lets you
// point the SPA at a different backend WITHOUT rebuilding: just edit this file
// and redeploy it alongside the static assets.
//
// Typical use: the Cloudflare Quick Tunnel URL changes on every restart, so
// after starting cloudflared you only update apiBaseUrl here instead of doing
// a full `npm run build`.
//
// Leave apiBaseUrl empty ("") to fall back to the build-time VITE_API_BASE_URL.
window.__BOOKSTORE_CONFIG__ = {
  apiBaseUrl: "",
};
