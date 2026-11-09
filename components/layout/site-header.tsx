import Link from "next/link";
import { site } from "@/config/site";

const NAV = [
  { href: "/catalogo", label: "Catálogo" },
  { href: "/vender", label: "Vender" },
  { href: "/autenticidad", label: "Autenticidad" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-linea bg-papel">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4 sm:px-8">
        <Link href="/" className="font-display text-2xl leading-none tracking-tight">
          {site.name}
        </Link>
        <nav aria-label="Principal" className="order-3 w-full sm:order-none sm:w-auto">
          <ul className="flex gap-6 text-sm text-grafito">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="underline-offset-4 hover:text-tinta hover:underline">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <form action="/catalogo" role="search" className="ml-auto flex min-w-0 flex-1 justify-end sm:max-w-xs">
          <label htmlFor="busqueda-global" className="sr-only">
            Buscar por marca o modelo
          </label>
          <input
            id="busqueda-global"
            name="q"
            type="search"
            placeholder="Buscar marca o modelo"
            className="w-full border-b border-linea bg-transparent py-1 text-sm placeholder:text-piedra focus:border-tinta focus:outline-none"
          />
        </form>
      </div>
    </header>
  );
}
