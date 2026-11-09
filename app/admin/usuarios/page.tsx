import type { Metadata } from "next";
import { listUsers } from "@/lib/auth/service";
import { hasRole, requireRole, STAFF_ROLES, type Role } from "@/lib/auth/session";
import { formatDate } from "@/lib/domain/labels";
import { setSuspendedAction, updateRolesAction } from "../actions";

export const metadata: Metadata = { title: "Usuarios y roles" };

const ASSIGNABLE: { role: Role; label: string; help: string }[] = [
  { role: "vendedor", label: "Vendedor", help: "Se asigna solo al registrar datos bancarios" },
  { role: "autenticador", label: "Autenticador", help: "Recibe, autentica y fotografía piezas" },
  { role: "operaciones", label: "Operaciones", help: "Entregas y recolecciones" },
  { role: "finanzas", label: "Finanzas", help: "Cobros, reembolsos y pagos a vendedores" },
  { role: "admin", label: "Administrador", help: "Todo, incluida la configuración" },
];

export default async function UsersPage({ searchParams }: { searchParams: { q?: string } }) {
  const me = await requireRole(STAFF_ROLES, "/admin/usuarios");
  const canEdit = hasRole(me, "admin");
  const users = await listUsers(searchParams.q);

  return (
    <div>
      <form className="mb-8 flex max-w-md gap-2" role="search">
        <label htmlFor="q" className="sr-only">Buscar por nombre o correo</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={searchParams.q}
          placeholder="Buscar por nombre o correo"
          className="w-full border border-linea bg-white px-3 py-2 focus:border-tinta focus:outline-none"
        />
        <button type="submit" className="bg-tinta px-4 py-2 text-sm text-papel hover:bg-grafito">Buscar</button>
      </form>

      {!canEdit && <p className="mb-6 text-sm text-grafito">Solo un administrador puede cambiar roles o suspender cuentas.</p>}

      {users.length === 0 ? (
        <p className="text-grafito">No hay usuarios que coincidan.</p>
      ) : (
        <ul className="divide-y divide-linea border-y border-linea">
          {users.map((u) => {
            const isMe = u.id === me.id;
            return (
              <li key={u.id} className="grid gap-6 py-6 lg:grid-cols-[1fr_1.4fr_12rem]">
                <div className="min-w-0">
                  <p className="font-medium">{u.full_name ?? "Sin nombre"}{isMe ? " (tú)" : ""}</p>
                  <p className="truncate text-sm text-grafito">{u.email}</p>
                  <p className="mt-1 text-xs text-piedra">
                    Alta {formatDate(u.created_at)}
                    {u.last_login_at ? `, último ingreso ${formatDate(u.last_login_at)}` : ""}
                    {u.email_verified_at ? "" : ", correo sin confirmar"}
                  </p>
                  {u.is_suspended && <p className="mt-2 text-sm font-medium">Cuenta suspendida</p>}
                </div>

                <form action={updateRolesAction} className="space-y-3">
                  <input type="hidden" name="userId" value={u.id} />
                  <fieldset disabled={!canEdit} className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    <legend className="sr-only">Roles de {u.email}</legend>
                    {ASSIGNABLE.map((a) => (
                      <label key={a.role} className="flex items-start gap-2 text-sm" title={a.help}>
                        <input
                          type="checkbox"
                          name="roles"
                          value={a.role}
                          defaultChecked={u.roles.includes(a.role)}
                          disabled={isMe && a.role === "admin"}
                          className="mt-1 accent-tinta"
                        />
                        <span>{a.label}</span>
                      </label>
                    ))}
                    {isMe && u.roles.includes("admin") && <input type="hidden" name="roles" value="admin" />}
                  </fieldset>
                  {canEdit && (
                    <button type="submit" className="text-sm underline underline-offset-4">Guardar roles</button>
                  )}
                </form>

                {canEdit && !isMe ? (
                  <form action={setSuspendedAction} className="flex flex-col items-start gap-2 lg:items-end">
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="suspend" value={u.is_suspended ? "0" : "1"} />
                    {!u.is_suspended && (
                      <>
                        <label htmlFor={`reason-${u.id}`} className="sr-only">Motivo de la suspensión</label>
                        <input
                          id={`reason-${u.id}`}
                          name="reason"
                          placeholder="Motivo"
                          className="w-40 border border-linea bg-white px-2 py-1.5 text-sm focus:border-tinta focus:outline-none"
                        />
                      </>
                    )}
                    <button type="submit" className="border border-tinta px-3 py-1.5 text-sm hover:bg-tinta hover:text-papel">
                      {u.is_suspended ? "Reactivar cuenta" : "Suspender cuenta"}
                    </button>
                  </form>
                ) : (
                  <div aria-hidden className="hidden lg:block" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
