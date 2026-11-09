import "server-only";
import type { PoolClient } from "pg";
import { query, transaction } from "@/lib/db";
import { DUMMY_HASH, hashPassword, verifyPassword } from "./password";
import { hashToken, newToken } from "./tokens";
import type { Role } from "./session";

const VERIFY_HOURS = 24;
const RESET_MINUTES = 60;
const LOCK_WINDOW_MINUTES = 15;
const MAX_FAILED_PER_EMAIL = 5;
const MAX_FAILED_PER_IP = 20;

export async function audit(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  data?: Record<string, unknown>,
  client?: PoolClient,
): Promise<void> {
  const sql = "insert into audit_logs (actor_id, action, entity, entity_id, data) values ($1, $2, $3, $4, $5)";
  const params = [actorId, action, entity, entityId, data ? JSON.stringify(data) : null];
  if (client) await client.query(sql, params);
  else await query(sql, params);
}

// ---------------------------------------------------------------------
// Registro y verificación de correo
// ---------------------------------------------------------------------

export async function createUser(input: { email: string; password: string; fullName: string }): Promise<
  { ok: true; id: string; sessionVersion: number; verifyToken: string } | { ok: false; reason: "email_taken" }
> {
  const hash = await hashPassword(input.password);
  try {
    return await transaction(async (c) => {
      const { rows } = await c.query<{ id: string; session_version: number }>(
        "insert into users (email, password_hash, full_name) values ($1, $2, $3) returning id, session_version",
        [input.email, hash, input.fullName],
      );
      const user = rows[0];
      const { token, hash: tokenHash } = newToken();
      await c.query(
        `insert into email_verification_tokens (token_hash, user_id, expires_at) values ($1, $2, now() + interval '${VERIFY_HOURS} hours')`,
        [tokenHash, user.id],
      );
      await audit(user.id, "registro", "users", user.id, undefined, c);
      return { ok: true as const, id: user.id, sessionVersion: user.session_version, verifyToken: token };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, reason: "email_taken" };
    throw e;
  }
}

export async function issueVerificationToken(userId: string): Promise<string> {
  const { token, hash } = newToken();
  await query(
    `insert into email_verification_tokens (token_hash, user_id, expires_at) values ($1, $2, now() + interval '${VERIFY_HOURS} hours')`,
    [hash, userId],
  );
  return token;
}

/** Cuántos correos de verificación se pidieron en la última hora (para limitar reenvíos). */
export async function recentVerificationRequests(userId: string): Promise<number> {
  const rows = await query<{ n: string }>(
    "select count(*) as n from email_verification_tokens where user_id = $1 and created_at > now() - interval '1 hour'",
    [userId],
  );
  return Number(rows[0].n);
}

export async function consumeVerificationToken(token: string): Promise<boolean> {
  return transaction(async (c) => {
    const { rows } = await c.query<{ user_id: string }>(
      `update email_verification_tokens set used_at = now()
       where token_hash = $1 and used_at is null and expires_at > now()
       returning user_id`,
      [hashToken(token)],
    );
    if (!rows[0]) return false;
    await c.query("update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1", [rows[0].user_id]);
    await c.query("update email_verification_tokens set used_at = now() where user_id = $1 and used_at is null", [rows[0].user_id]);
    await audit(rows[0].user_id, "correo_verificado", "users", rows[0].user_id, undefined, c);
    return true;
  });
}

// ---------------------------------------------------------------------
// Login con límite de intentos
// ---------------------------------------------------------------------

export async function isLockedOut(email: string, ip: string | null): Promise<boolean> {
  const rows = await query<{ by_email: string; by_ip: string }>(
    `select
       count(*) filter (where lower(email) = lower($1)) as by_email,
       count(*) filter (where $2::text is not null and ip = $2) as by_ip
     from login_attempts
     where not succeeded and created_at > now() - interval '${LOCK_WINDOW_MINUTES} minutes'`,
    [email, ip],
  );
  return Number(rows[0].by_email) >= MAX_FAILED_PER_EMAIL || Number(rows[0].by_ip) >= MAX_FAILED_PER_IP;
}

export async function authenticate(
  email: string,
  password: string,
  ip: string | null,
): Promise<{ ok: true; id: string; sessionVersion: number } | { ok: false; reason: "invalid" | "locked" | "suspended" }> {
  if (await isLockedOut(email, ip)) return { ok: false, reason: "locked" };

  const rows = await query<{ id: string; password_hash: string; session_version: number; is_suspended: boolean }>(
    "select id, password_hash, session_version, is_suspended from users where lower(email) = lower($1)",
    [email],
  );
  const user = rows[0];
  // Siempre se compara un hash para que el tiempo de respuesta no revele si el correo existe.
  const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  const succeeded = Boolean(user && valid);

  await query("insert into login_attempts (email, ip, succeeded) values ($1, $2, $3)", [email, ip, succeeded]);
  if (!user || !valid) return { ok: false, reason: "invalid" };
  if (user.is_suspended) return { ok: false, reason: "suspended" };

  await query("update users set last_login_at = now() where id = $1", [user.id]);
  return { ok: true, id: user.id, sessionVersion: user.session_version };
}

// ---------------------------------------------------------------------
// Recuperación y cambio de contraseña
// ---------------------------------------------------------------------

/** Devuelve el token solo si el correo existe; quien llama siempre responde igual al usuario. */
export async function createPasswordReset(email: string): Promise<string | null> {
  const rows = await query<{ id: string; recent: string }>(
    `select u.id,
       (select count(*) from password_reset_tokens t where t.user_id = u.id and t.created_at > now() - interval '1 hour') as recent
     from users u where lower(u.email) = lower($1) and not u.is_suspended`,
    [email],
  );
  const user = rows[0];
  if (!user || Number(user.recent) >= 3) return null;
  const { token, hash } = newToken();
  await query(
    `insert into password_reset_tokens (token_hash, user_id, expires_at) values ($1, $2, now() + interval '${RESET_MINUTES} minutes')`,
    [hash, user.id],
  );
  return token;
}

export async function isResetTokenValid(token: string): Promise<boolean> {
  const rows = await query(
    "select 1 from password_reset_tokens where token_hash = $1 and used_at is null and expires_at > now()",
    [hashToken(token)],
  );
  return rows.length > 0;
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ ok: true; id: string; email: string; sessionVersion: number } | { ok: false }> {
  const hash = await hashPassword(newPassword);
  return transaction(async (c) => {
    const { rows } = await c.query<{ user_id: string }>(
      `update password_reset_tokens set used_at = now()
       where token_hash = $1 and used_at is null and expires_at > now() returning user_id`,
      [hashToken(token)],
    );
    if (!rows[0]) return { ok: false as const };
    const userId = rows[0].user_id;
    // Restablecer por correo también confirma que el correo es suyo.
    const { rows: users } = await c.query<{ email: string; session_version: number }>(
      `update users set password_hash = $2, session_version = session_version + 1,
              email_verified_at = coalesce(email_verified_at, now())
       where id = $1 returning email, session_version`,
      [userId, hash],
    );
    await c.query("update password_reset_tokens set used_at = now() where user_id = $1 and used_at is null", [userId]);
    await audit(userId, "contrasena_restablecida", "users", userId, undefined, c);
    return { ok: true as const, id: userId, email: users[0].email, sessionVersion: users[0].session_version };
  });
}

export async function changePassword(
  userId: string,
  current: string,
  next: string,
): Promise<{ ok: true; sessionVersion: number } | { ok: false }> {
  const rows = await query<{ password_hash: string }>("select password_hash from users where id = $1", [userId]);
  if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) return { ok: false };
  const hash = await hashPassword(next);
  const updated = await query<{ session_version: number }>(
    "update users set password_hash = $2, session_version = session_version + 1 where id = $1 returning session_version",
    [userId, hash],
  );
  await audit(userId, "contrasena_cambiada", "users", userId);
  return { ok: true, sessionVersion: updated[0].session_version };
}

export async function checkPassword(userId: string, password: string): Promise<boolean> {
  const rows = await query<{ password_hash: string }>("select password_hash from users where id = $1", [userId]);
  return Boolean(rows[0]) && verifyPassword(password, rows[0].password_hash);
}

// ---------------------------------------------------------------------
// Perfil y datos bancarios
// ---------------------------------------------------------------------

export async function updateProfile(userId: string, fullName: string, phone: string | null): Promise<void> {
  await query("update users set full_name = $2, phone = $3 where id = $1", [userId, fullName, phone]);
}

export interface PayoutAccount {
  holder_name: string;
  bank_name: string;
  clabe: string;
  rfc: string | null;
  verified_at: Date | null;
  updated_at: Date;
}

export async function getPayoutAccount(userId: string): Promise<PayoutAccount | null> {
  const rows = await query<PayoutAccount>(
    "select holder_name, bank_name, clabe, rfc, verified_at, updated_at from seller_payout_accounts where seller_id = $1",
    [userId],
  );
  return rows[0] ?? null;
}

/** Guarda la cuenta de pago y otorga el rol de vendedor. Un cambio de CLABE quita la verificación. */
export async function savePayoutAccount(
  userId: string,
  data: { holderName: string; bankName: string; clabe: string; rfc: string | null },
): Promise<{ clabeChanged: boolean; isNew: boolean }> {
  return transaction(async (c) => {
    const { rows: prev } = await c.query<{ clabe: string }>(
      "select clabe from seller_payout_accounts where seller_id = $1 for update",
      [userId],
    );
    const isNew = !prev[0];
    const clabeChanged = !isNew && prev[0].clabe !== data.clabe;
    await c.query(
      `insert into seller_payout_accounts (seller_id, holder_name, bank_name, clabe, rfc)
       values ($1, $2, $3, $4, $5)
       on conflict (seller_id) do update set
         holder_name = excluded.holder_name, bank_name = excluded.bank_name, clabe = excluded.clabe, rfc = excluded.rfc,
         verified_at = case when seller_payout_accounts.clabe = excluded.clabe then seller_payout_accounts.verified_at else null end`,
      [userId, data.holderName, data.bankName, data.clabe, data.rfc],
    );
    await c.query("insert into user_roles (user_id, role) values ($1, 'vendedor') on conflict do nothing", [userId]);
    await audit(
      userId,
      isNew ? "cuenta_pago_creada" : clabeChanged ? "clabe_cambiada" : "cuenta_pago_actualizada",
      "seller_payout_accounts",
      userId,
      { clabe_final: data.clabe.slice(-4), banco: data.bankName },
      c,
    );
    return { clabeChanged, isNew };
  });
}

// ---------------------------------------------------------------------
// Administración de usuarios
// ---------------------------------------------------------------------

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  email_verified_at: Date | null;
  is_suspended: boolean;
  created_at: Date;
  last_login_at: Date | null;
  roles: Role[];
}

export async function listUsers(search: string | undefined, limit = 50): Promise<AdminUserRow[]> {
  const term = search?.trim() ? `%${search.trim().toLowerCase()}%` : null;
  return query<AdminUserRow>(
    `select u.id, u.email, u.full_name, u.email_verified_at, u.is_suspended, u.created_at, u.last_login_at,
            coalesce(array_agg(r.role::text order by r.role) filter (where r.role is not null), '{}') as roles
     from users u left join user_roles r on r.user_id = u.id
     where $1::text is null or lower(u.email) like $1 or lower(coalesce(u.full_name, '')) like $1
     group by u.id
     order by u.created_at desc
     limit $2`,
    [term, limit],
  );
}

export async function setRole(actorId: string, targetId: string, role: Role, enabled: boolean): Promise<void> {
  if (role === "comprador") return; // todos son compradores
  if (enabled) {
    await query("insert into user_roles (user_id, role, granted_by) values ($1, $2, $3) on conflict do nothing", [targetId, role, actorId]);
  } else {
    if (role === "admin") {
      const admins = await query<{ n: string }>("select count(*) as n from user_roles where role = 'admin' and user_id <> $1", [targetId]);
      if (Number(admins[0].n) === 0) throw new Error("Debe quedar al menos un administrador");
    }
    await query("delete from user_roles where user_id = $1 and role = $2", [targetId, role]);
  }
  await audit(actorId, enabled ? "rol_otorgado" : "rol_retirado", "users", targetId, { rol: role });
}

export async function setSuspended(actorId: string, targetId: string, suspended: boolean, reason: string | null): Promise<void> {
  if (actorId === targetId) throw new Error("No puedes suspender tu propia cuenta");
  await query(
    `update users set is_suspended = $2, suspended_reason = $3,
       session_version = case when $2 then session_version + 1 else session_version end
     where id = $1`,
    [targetId, suspended, suspended ? reason : null],
  );
  await audit(actorId, suspended ? "cuenta_suspendida" : "cuenta_reactivada", "users", targetId, reason ? { motivo: reason } : undefined);
}
