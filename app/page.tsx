import Link from "next/link";
import { FichaShell } from "@/components/ficha";
import { ProductGrid } from "@/components/product-card";
import { ConfigNotice, EmptyState } from "@/components/notices";
import {
  CatalogUnavailableError,
  getBrandsInStock,
  getCategories,
  getFeatured,
  getLatest,
  getRecentlySold,
} from "@/lib/catalog";
import { site } from "@/config/site";

export const revalidate = 120;

async function loadHome() {
  try {
    const [latest, featured, sold, categories, brands] = await Promise.all([
      getLatest(8),
      getFeatured(4),
      getRecentlySold(4),
      getCategories(),
      getBrandsInStock(),
    ]);
    return { ok: true as const, latest, featured, sold, categories, brands };
  } catch (e) {
    if (e instanceof CatalogUnavailableError) return { ok: false as const };
    throw e;
  }
}

const BUYER_STEPS = [
  "Elige una pieza. Todo lo que ves ya está en nuestras manos y autenticado.",
  "Paga en línea. La pieza queda apartada para ti.",
  "Te la entregamos en Guadalajara o la recoges en sucursal.",
  "Tienes 72 horas para revisarla con calma.",
];

const SELLER_STEPS = [
  "Envía fotos de tu pieza y el precio que esperas.",
  "Te proponemos precio de venta y comisión.",
  "La entregas en sucursal o pasamos por ella.",
  "La autenticamos, la fotografiamos y la publicamos. Se queda con nosotros al menos un mes.",
  "Si se vende, te pagamos por SPEI el mismo día que termina la ventana de 72 horas del comprador.",
  "Después del mes, si no se ha vendido, tú decides: la retiras o la dejas a la venta.",
];

export default async function Home() {
  const data = await loadHome();

  return (
    <>
      <section className="mx-auto grid max-w-7xl items-center gap-14 px-4 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:pt-24">
        <div>
          <h1 className="font-display text-display tracking-tight">
            Lujo preloved, revisado pieza por pieza en {site.city}.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-grafito">
            No publicamos nada que no hayamos tenido en las manos. Cada bolso, prenda y par se recibe, se autentica
            físicamente y se fotografía aquí antes de salir a la venta.
          </p>
          <div className="mt-9 flex flex-wrap gap-3 text-sm">
            <Link href="/catalogo" className="bg-tinta px-6 py-3 text-papel hover:bg-grafito">
              Ver catálogo
            </Link>
            <Link href="/vender" className="border border-tinta px-6 py-3 hover:bg-tinta hover:text-papel">
              Consignar una pieza
            </Link>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <FichaShell className="ficha-entrada">
            <p className="font-display text-2xl">La ficha de cada pieza</p>
            <p className="mb-4 mt-1 text-sm text-grafito">Así llega una pieza al catálogo. Este registro acompaña cada publicación.</p>
            <ol className="space-y-3 text-sm">
              {[
                ["Recepción", "Registramos la pieza y lo que incluye."],
                ["Autenticación física", "Materiales, costuras, herrajes, etiquetas y códigos."],
                ["Condición verificada", "Calificación del 1 al 10 confirmada por una persona."],
                ["Publicación", "Fotografías propias, con defectos documentados."],
              ].map(([title, text], i) => (
                <li key={title} className="grid grid-cols-[1.5rem_1fr] gap-2">
                  <span className="text-piedra tabular-nums">{i + 1}</span>
                  <span>
                    <span className="font-medium">{title}.</span> <span className="text-grafito">{text}</span>
                  </span>
                </li>
              ))}
            </ol>
          </FichaShell>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-24 px-4 sm:px-8">
        {!data.ok ? (
          <ConfigNotice />
        ) : (
          <>
            <nav aria-label="Categorías">
              <ul className="flex flex-wrap gap-x-8 gap-y-3 border-y border-linea py-5 text-sm">
                {data.categories.map((c) =>
                  c.is_enabled ? (
                    <li key={c.slug}>
                      <Link href={`/catalogo?categoria=${c.slug}`} className="hover:underline underline-offset-4">
                        {c.name}
                      </Link>
                    </li>
                  ) : (
                    <li key={c.slug} className="text-piedra">
                      {c.name} <span className="text-xs">(muy pronto)</span>
                    </li>
                  ),
                )}
              </ul>
            </nav>

            {data.featured.length > 0 && (
              <section aria-labelledby="destacadas">
                <h2 id="destacadas" className="mb-8 font-display text-title">
                  Destacadas
                </h2>
                <ProductGrid products={data.featured} />
              </section>
            )}

            <section aria-labelledby="recientes">
              <div className="mb-8 flex items-baseline justify-between gap-4">
                <h2 id="recientes" className="font-display text-title">
                  Recién publicadas
                </h2>
                {data.latest.length > 0 && (
                  <Link href="/catalogo" className="text-sm underline underline-offset-4">
                    Ver todo el catálogo
                  </Link>
                )}
              </div>
              {data.latest.length > 0 ? (
                <ProductGrid products={data.latest} />
              ) : (
                <EmptyState title="Las primeras piezas están en autenticación" action={{ href: "/vender", label: "Consignar una pieza" }}>
                  Publicamos cada pieza en cuanto termina su revisión física. Si tienes algo de diseñador que ya no usas, puede ser de las primeras.
                </EmptyState>
              )}
            </section>

            {data.brands.length > 0 && (
              <section aria-labelledby="marcas">
                <h2 id="marcas" className="mb-6 font-display text-title">
                  Marcas disponibles
                </h2>
                <ul className="flex flex-wrap gap-x-6 gap-y-2 text-lg">
                  {data.brands.map((b) => (
                    <li key={b.slug}>
                      <Link href={`/catalogo?marca=${b.slug}`} className="hover:underline underline-offset-4">
                        {b.name}
                      </Link>{" "}
                      <span className="text-sm text-piedra">{b.count}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.sold.length > 0 && (
              <section aria-labelledby="vendidas">
                <h2 id="vendidas" className="mb-8 font-display text-title">
                  Vendidas recientemente
                </h2>
                <ProductGrid products={data.sold} />
              </section>
            )}
          </>
        )}

        <section aria-labelledby="como-funciona" className="grid gap-14 border-t border-linea pt-16 md:grid-cols-2">
          <div>
            <h2 id="como-funciona" className="font-display text-title">
              Si compras
            </h2>
            <ol className="mt-6 space-y-4">
              {BUYER_STEPS.map((s, i) => (
                <li key={s} className="grid grid-cols-[2rem_1fr] text-grafito">
                  <span className="text-piedra tabular-nums">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="font-display text-title">Si vendes</h2>
            <ol className="mt-6 space-y-4">
              {SELLER_STEPS.map((s, i) => (
                <li key={s} className="grid grid-cols-[2rem_1fr] text-grafito">
                  <span className="text-piedra tabular-nums">{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
            <Link href="/vender" className="mt-8 inline-block text-sm underline underline-offset-4">
              Comisiones y requisitos para vender
            </Link>
          </div>
        </section>

        <section aria-labelledby="confianza" className="bg-white px-6 py-12 sm:px-12">
          <h2 id="confianza" className="max-w-2xl font-display text-title">
            Una evaluación con IA ayuda. La autenticidad la decide una persona con la pieza en la mano.
          </h2>
          <div className="mt-6 grid max-w-4xl gap-6 text-grafito md:grid-cols-2">
            <p>
              Usamos inteligencia artificial para hacer una primera lectura de la condición a partir de las fotos de quien vende.
              Esa lectura nunca se publica como garantía.
            </p>
            <p>
              Cada publicación distingue lo que declaró el vendedor, la condición que verificamos y si la pieza pasó la autenticación física.
              Si una pieza resulta no auténtica, te devolvemos el total.
            </p>
          </div>
          <Link href="/autenticidad" className="mt-8 inline-block text-sm underline underline-offset-4">
            Cómo autenticamos
          </Link>
        </section>
      </div>
    </>
  );
}

