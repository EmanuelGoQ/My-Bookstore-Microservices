const requiredValue = (name) => {
  const value = import.meta.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required frontend environment variable: ${name}`);
  }

  return value;
};

const normalizePrefix = (value, name) => {
  if (!value.startsWith("/")) {
    throw new Error(`${name} must start with '/'`);
  }

  return value.replace(/\/$/, "");
};

// Resolve the API base URL with runtime override precedence:
//   1. window.__BOOKSTORE_CONFIG__.apiBaseUrl  (from /runtime-config.js, editable
//      after deploy without rebuilding — handy for the changing Quick Tunnel URL)
//   2. VITE_API_BASE_URL                         (baked at build time)
const resolveApiBaseUrl = () => {
  const runtime =
    typeof window !== "undefined" &&
    window.__BOOKSTORE_CONFIG__ &&
    typeof window.__BOOKSTORE_CONFIG__.apiBaseUrl === "string"
      ? window.__BOOKSTORE_CONFIG__.apiBaseUrl.trim()
      : "";

  if (runtime) {
    return runtime.replace(/\/$/, "") || "/";
  }

  return requiredValue("VITE_API_BASE_URL");
};

export const frontendConfig = Object.freeze({
  apiBaseUrl: resolveApiBaseUrl(),
  apiPrefix: normalizePrefix(requiredValue("VITE_API_PREFIX"), "VITE_API_PREFIX"),
  currency: Object.freeze({
    locale: requiredValue("VITE_CURRENCY_LOCALE"),
    code: requiredValue("VITE_CURRENCY_CODE"),
  }),
});
