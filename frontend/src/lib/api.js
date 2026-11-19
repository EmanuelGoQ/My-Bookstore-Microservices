import axios from "axios";

import { frontendConfig } from "../config/env.js";
import { normalizeApiError } from "./apiError.js";
import { getToken, clearToken } from "./authToken.js";

export const api = axios.create({
  baseURL: frontendConfig.apiBaseUrl,
  // withCredentials stays true so same-site/local cookie flows keep working;
  // in the Cloudflare cross-site deployment the Bearer header below is what
  // actually carries the session.
  withCredentials: true,
});

// Attach the Bearer token (if any) to every outgoing request.
api.interceptors.request.use((requestConfig) => {
  const token = getToken();
  if (token) {
    requestConfig.headers = requestConfig.headers ?? {};
    requestConfig.headers.Authorization = `Bearer ${token}`;
  }
  return requestConfig;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A stale/invalid token: drop it so the app falls back to anonymous.
    if (error.response?.status === 401) {
      clearToken();
    }
    return Promise.reject(normalizeApiError(error));
  }
);
