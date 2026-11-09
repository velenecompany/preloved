"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { query } from "@/lib/db";
import { requireRole, ROLES, type Role } from "@/lib/auth/session";
import { setRole, setSuspended } from "@/lib/auth/service";

const ASSIGNABLE = ROLES.filter((r) => r !== "comprador") as Exclude<Role, "comprador">[];

const rolesSchema = z.object({
  userId: z.string().uuid(),
  roles: z.array(z.enum(ASSIGNABLE as [Role, ...Role[]])),
});

export async function updateRolesAction(formData: FormData): Promise<void> {
  const admin = await requireRole(["admin"], "/admin/usuarios");
  const parsed = rolesSchema.parse({ userId: formData.get("userId"), roles: formData.getAll("roles") });

  const current = await query<{ role: Role }>("select role::text as role from user_roles where user_id = $1", [parsed.userId]);
  const have = new Set(current.map((r) => r.role));
  const want = new Set(parsed.roles);

  for (const role of ASSIGNABLE) {
    if (want.has(role) && !have.has(role)) await setRole(admin.id, parsed.userId, role, true);
    if (!want.has(role) && have.has(role)) await setRole(admin.id, parsed.userId, role, false);
  }
  revalidatePath("/admin/usuarios");
}

const suspendSchema = z.object({
  userId: z.string().uuid(),
  suspend: z.enum(["1", "0"]),
  reason: z.string().trim().max(300).optional(),
});

export async function setSuspendedAction(formData: FormData): Promise<void> {
  const admin = await requireRole(["admin"], "/admin/usuarios");
  const parsed = suspendSchema.parse(Object.fromEntries(formData));
  await setSuspended(admin.id, parsed.userId, parsed.suspend === "1", parsed.reason || null);
  revalidatePath("/admin/usuarios");
}
