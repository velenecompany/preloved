import Link from "next/link";
import { isStaff, requireUser } from "@/lib/auth/session";
import { logoutAction } from "@/app/(auth)/actions";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const links = [
    { href: "/cuenta", label: "Mi cuenta" },
    { href: "/cuenta/consignaciones", label: "Consignaciones" },
    { href: "/cuenta/datos-bancarios", label: "Datos bancarios" },
    ...(isStaff(user) ? [{ href: "/admin/solicitudes", label: "Administración" }] : []),
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-8">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-linea pb-6">
        <div>
          <p className="text-sm text-grafito">{user.email}</p>
          <h1 className="font-display text-title">{user.fullName ? `Hola, ${user.fullName.split(" ")[0]}` : "Mi cuenta"}</h1>
        </div>
        <nav aria-label="Cuenta" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-grafito underline-offset-4 hover:text-tinta hover:underline">
              {l.label}
            </Link>
          ))}
          <form action={logoutAction}>
            <button type="submit" className="text-grafito underline-offset-4 hover:text-tinta hover:underline">
              Cerrar sesión
            </button>
          </form>
        </nav>
      </div>
      {children}
    </div>
  );
}
