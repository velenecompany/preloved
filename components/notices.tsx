import Link from "next/link";
import type { ReactNode } from "react";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="border border-dashed border-linea px-6 py-14 text-center">
      <p className="font-display text-2xl">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-sm text-grafito">{children}</div>}
      {action && (
        <Link href={action.href} className="mt-6 inline-block border border-tinta px-5 py-2.5 text-sm hover:bg-tinta hover:text-papel">
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Se muestra cuando falta configurar la base de datos: nunca se rellenan datos ficticios. */
export function ConfigNotice() {
  return (
    <div className="border border-linea bg-white px-6 py-8 text-sm">
      <p className="font-medium">El catálogo aún no está conectado a la base de datos.</p>
      <p className="mt-1 text-grafito">
        Agrega <code>DATABASE_URL</code> de Neon en <code>.env.local</code> y corre <code>npm run db:migrate</code>.
        Las instrucciones están en el README.
      </p>
    </div>
  );
}
