import Link from "next/link";
import { site } from "@/config/site";
import { LEGAL_PAGES } from "@/content/legal";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-linea">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 text-sm sm:grid-cols-3 sm:px-8">
        <div className="space-y-2">
          <p className="font-display text-xl">{site.name}</p>
          <p className="max-w-xs text-grafito">Consignación de moda de diseñador en {site.city} y su zona metropolitana.</p>
        </div>
        <nav aria-label="Políticas">
          <h2 className="mb-3 font-medium">Políticas</h2>
          <ul className="space-y-1.5 text-grafito">
            {LEGAL_PAGES.map((p) => (
              <li key={p.slug}>
                <Link href={`/legal/${p.slug}`} className="hover:text-tinta hover:underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="mb-3 font-medium">Contacto</h2>
          <ul className="space-y-1.5 text-grafito">
            {site.email && (
              <li>
                <a href={`mailto:${site.email}`} className="hover:text-tinta hover:underline">
                  {site.email}
                </a>
              </li>
            )}
            {site.whatsapp && (
              <li>
                <a href={`https://wa.me/${site.whatsapp.replace(/\D/g, "")}`} className="hover:text-tinta hover:underline">
                  WhatsApp
                </a>
              </li>
            )}
            {site.instagram && (
              <li>
                <a href={site.instagram} className="hover:text-tinta hover:underline">
                  Instagram
                </a>
              </li>
            )}
            {!site.email && !site.whatsapp && !site.instagram && (
              <li className="text-piedra">Configura los datos de contacto en las variables de entorno.</li>
            )}
          </ul>
        </div>
      </div>
      <p className="mx-auto max-w-7xl px-4 pb-10 text-xs text-piedra sm:px-8">
        © {new Date().getFullYear()} {site.name}. Precios en pesos mexicanos.
      </p>
    </footer>
  );
}
