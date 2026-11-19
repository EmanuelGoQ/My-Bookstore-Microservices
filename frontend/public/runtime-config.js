// Runtime configuration, served as a static file (NOT bundled). It lets you
// point the SPA at a different backend WITHOUT rebuilding: just edit this file
// and redeploy it alongside the static assets.
//
// apiBaseUrl must be the HTTPS URL that fronts the backend. Today it is the
// Cloudflare Quick Tunnel to the EKS LoadBalancer. That URL CHANGES every time
// the tunnel (or the AWS Lab) is restarted: update it here and redeploy Pages.
//
// Leave apiBaseUrl empty ("") to fall back to the build-time VITE_API_BASE_URL.
window.__BOOKSTORE_CONFIG__ = {
  apiBaseUrl: "https://feeds-belong-distributions-kidney.trycloudflare.com",
};
