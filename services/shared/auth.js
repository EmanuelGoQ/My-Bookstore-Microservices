import { randomUUID } from "node:crypto";
import { parse } from "cookie";
import { jwtVerify, SignJWT } from "jose";

import { AppError } from "./errors/AppError.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Shared auth toolkit. user-service mints tokens; every service that needs to
// identify the caller verifies the same JWT and reads the session cookie. The
// JWT secret/issuer/audience must be identical across the fleet (injected via a
// shared Kubernetes Secret).
export const createAuth = (authConfig) => {
  const secretKey = new TextEncoder().encode(authConfig.jwt.secret);

  const createSessionToken = async (customerId) => {
    const sessionId = randomUUID();

    const token = await new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: authConfig.jwt.algorithm, typ: "JWT" })
      .setSubject(customerId)
      .setIssuer(authConfig.jwt.issuer)
      .setAudience(authConfig.jwt.audience)
      .setIssuedAt()
      .setExpirationTime(`${authConfig.jwt.ttlSeconds}s`)
      .sign(secretKey);

    return { token, sessionId };
  };

  const verifySessionToken = async (token) => {
    const { payload } = await jwtVerify(token, secretKey, {
      issuer: authConfig.jwt.issuer,
      audience: authConfig.jwt.audience,
      algorithms: [authConfig.jwt.algorithm],
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      !UUID_PATTERN.test(payload.sub) ||
      !UUID_PATTERN.test(payload.sid)
    ) {
      throw new Error("Session token is missing valid identity claims");
    }

    return { customerId: payload.sub, sessionId: payload.sid };
  };

  // Populates req.auth / req.authState from the session cookie. Never throws.
  const sessionContext = async (req, res, next) => {
    void res;

    req.auth = undefined;
    req.authState = "anonymous";

    const cookies = parse(req.headers.cookie ?? "");
    const token = cookies[authConfig.cookie.name];

    if (!token) {
      next();
      return;
    }

    try {
      req.auth = await verifySessionToken(token);
      req.authState = "authenticated";
    } catch {
      req.authState = "invalid";
    }

    next();
  };

  // Guard for protected routes. Relies on sessionContext having run first.
  const authenticate = async (req, res, next) => {
    void res;

    if (req.auth) {
      next();
      return;
    }

    if (req.authState === "invalid") {
      throw new AppError("The session is invalid or has expired", 401, "INVALID_SESSION");
    }

    throw new AppError("Authentication is required", 401, "AUTH_REQUIRED");
  };

  return { createSessionToken, verifySessionToken, sessionContext, authenticate };
};

export { UUID_PATTERN };
