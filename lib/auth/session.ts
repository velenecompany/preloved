import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "@/lib/db";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession } from "./jwt";

export const ROLES = ["comprador", "vendedor", "admin", "autenticador", "operaciones", "finanzas"] as const;
export type Role = (typeof ROLES)[number];
export const STAFF_ROLES: readonly Role[] = ["admin", "autenticador", "operaciones", "finanzas"];

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  emailVerified: boolean;
  roles: Role[];
}

export async function startSession(userId: string, sessionVersion: number): Promise<void> {
  const token = await signSession({ sub: userId, sv: sessionVersion });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/**
 * Usuario de la sesión actual, una sola consulta por petición.
 * Devuelve null si no hay sesión, si el token es inválido, si la cuenta está suspendida
 * o si la contraseña cambió después de iniciar esta sesión.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const claims = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const rows = await query<{
    id: string;
    email: string;
    full_name: string | null;
    phone: string | null;
    email_verified_at: Date | null;
    session_version: number;
    is_suspended: boolean;
    roles: Role[] | null;
  }>(
    `select u.id, u.email, u.full_name, u.phone, u.email_verified_at, u.session_version, u.is_suspended,
            array_agg(r.role::text) filter (where r.role is not null) as roles
     from users u left join user_roles r on r.user_id = u.id
     where u.id = $1
     group by u.id`,
    [claims.sub],
  );
  const u = rows[0];
  if (!u || u.is_suspended || u.session_version !== claims.sv) return null;
  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    phone: u.phone,
    emailVerified: u.email_verified_at !== null,
    roles: u.roles ?? [],
  };
});

export async function requireUser(returnTo = "/cuenta"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/ingresar?siguiente=${encodeURIComponent(returnTo)}`);
  return user;
}

export function hasRole(user: CurrentUser, ...roles: Role[]): boolean {
  return roles.some((r) => user.roles.includes(r));
}

export function isStaff(user: CurrentUser): boolean {
  return hasRole(user, ...STAFF_ROLES);
}

/** Exige al menos uno de los roles; si no, manda a la cuenta del usuario. */
export async function requireRole(roles: readonly Role[], returnTo: string): Promise<CurrentUser> {
  const user = await requireUser(returnTo);
  if (!hasRole(user, ...roles)) redirect("/cuenta?aviso=sin-permiso");
  return user;
}
