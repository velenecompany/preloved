import type { Role } from "@/lib/auth/session";

/** Quién hace cada paso del inventario. */
export const OPERATIONS: readonly Role[] = ["admin", "operaciones"];
export const AUTHENTICATORS: readonly Role[] = ["admin", "autenticador"];
export const PHOTOGRAPHERS: readonly Role[] = ["admin", "operaciones", "autenticador"];
