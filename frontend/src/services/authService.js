import { authEndpoints } from "../config/endpoints.js";
import { api } from "../lib/api.js";
import { setToken, clearToken, getToken } from "../lib/authToken.js";

const toUser = (raw) => ({
  id: raw.customerId,
  firstName: raw.firstName,
  lastName: raw.lastName,
  email: raw.email,
  city: raw.city,
  country: raw.country,
});

export const authService = Object.freeze({
  // Returns null when there is no active session instead of failing.
  getCurrentUser: async () => {
    // No token: the user is anonymous; skip the call (and the guaranteed 401).
    if (!getToken()) {
      return null;
    }

    try {
      const { data } = await api.get(authEndpoints.me);
      return toUser(data.user);
    } catch (error) {
      if (error.status === 401) {
        clearToken();
        return null;
      }
      throw error;
    }
  },

  login: async (email) => {
    const { data } = await api.post(authEndpoints.login, { email });
    // Store the Bearer token returned in the body (Option A).
    if (data.token) {
      setToken(data.token);
    }
    return toUser(data.user);
  },

  logout: async () => {
    try {
      await api.post(authEndpoints.logout);
    } finally {
      // Always drop the local token, even if the server call fails.
      clearToken();
    }
  },
});
