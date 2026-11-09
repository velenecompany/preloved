import Link from "next/link";
import { requireRole, STAFF_ROLES } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(STAFF_ROLES, "/admin/usuarios");
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-8">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-linea pb-6">
        <h1 className="font-display text-title">Administración</h1>
        <nav aria-label="Administración" className="flex gap-6 text-sm">
          <Link href="/admin/usuarios" className="text-grafito underline-offset-4 hover:text-tinta hover:underline">
            Usuarios y roles
          </Link>
          <Link href="/cuenta" className="text-grafito underline-offset-4 hover:text-tinta hover:underline">
            Mi cuenta
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
