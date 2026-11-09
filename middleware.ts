import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/jwt";

/**
 * Primera barrera: sin una sesión con firma válida no se entra a /cuenta ni a /admin.
 * Los permisos por rol y la suspensión se revisan en el servidor de cada página (lib/auth/session).
 */
export async function middleware(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  const login = new URL("/ingresar", request.url);
  login.searchParams.set("siguiente", request.nextUrl.pathname + request.nextUrl.search);
  const response = NextResponse.redirect(login);
  if (request.cookies.has(SESSION_COOKIE)) response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const config = {
  matcher: ["/cuenta/:path*", "/admin/:path*"],
};
