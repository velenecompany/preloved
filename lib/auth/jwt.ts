import { jwtVerify, SignJWT } from "jose";

/**
 * Firma y verificación del token de sesión. No importa nada de Node para que también
 * funcione en el middleware (Edge runtime).
 */

export const SESSION_COOKIE = "reloop_session";
export const SESSION_DAYS = 30;

export interface SessionClaims {
  sub: string;
  sv: number;
}

function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error("JWT_SECRET debe existir y tener al menos 32 caracteres");
  }
  return new TextEncoder().encode(value);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ sv: claims.sv })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.sv !== "number") return null;
    return { sub: payload.sub, sv: payload.sv };
  } catch {
    return null;
  }
}

/** Solo permite redirigir a rutas internas (evita redirecciones abiertas a otros sitios). */
export function safeRedirect(target: string | null | undefined, fallback = "/cuenta"): string {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.includes("\\")) return fallback;
  return target;
}
