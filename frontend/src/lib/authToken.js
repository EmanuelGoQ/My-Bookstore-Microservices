// Bearer token store for the SPA. The session JWT is returned by the login
// endpoint in the response body and kept in localStorage, then sent on every
// request as `Authorization: Bearer <token>`. This avoids cross-site cookies
// (the frontend is served from Cloudflare over HTTPS while the API is on a
// different origin), which browsers block for SameSite/Secure reasons.

const TOKEN_KEY = "bookstore_token";

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token) => {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Storage unavailable (private mode / disabled): the session simply won't
    // persist across reloads, but the in-memory flow still works.
  }
};

export const clearToken = () => setToken(null);
