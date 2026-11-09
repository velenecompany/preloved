import type { Metadata } from "next";
import Link from "next/link";
import { ProductGrid } from "@/components/product-card";
import { ConfigNotice, EmptyState } from "@/components/notices";
import {
  CatalogUnavailableError,
  getBrandsInStock,
  getCatalog,
  getCategories,
  getSizesInStock,
  PAGE_SIZE,
  parseFilters,
  type CatalogFilters,
} from "@/lib/catalog";

export const metadata: Metadata = { title: "Catálogo" };

type SearchParams = Record<string, string | string[] | undefined>;

function hrefWith(f: CatalogFilters, changes: Partial<Record<keyof CatalogFilters, string | number | undefined>>) {
  const params = new URLSearchParams();
  const merged: Record<string, unknown> = { ...f, ...changes };
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === "" || v === false) continue;
    if (k === "disponibles") {
      if (v === true) continue;
      params.set(k, "0");
      continue;
    }
    if (k === "fullset") {
      params.set(k, "1");
      continue;
    }
    if (k === "orden" && v === "recientes") continue;
    if (k === "pagina" && v === 1) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `/catalogo?${qs}` : "/catalogo";
}

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(searchParams);

  let result;
  try {
    const [catalog, categories, brands, sizes] = await Promise.all([
      getCatalog(filters),
      getCategories(),
      getBrandsInStock(),
      getSizesInStock(),
    ]);
    result = { catalog, categories, brands, sizes };
  } catch (e) {
    if (e instanceof CatalogUnavailableError) {
      return (
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-8">
          <ConfigNotice />
        </div>
      );
    }
    throw e;
  }

  const { catalog, categories, brands, sizes } = result;
  const pages = Math.max(1, Math.ceil(catalog.total / PAGE_SIZE));
  const activeCategory = categories.find((c) => c.slug === filters.categoria);
  const hasFilters = Boolean(
    filters.q || filters.categoria || filters.marca || filters.talla || filters.min !== undefined ||
      filters.max !== undefined || filters.condicion || filters.fullset || !filters.disponibles,
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-8">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-title">
            {filters.q ? `Resultados para “${filters.q}”` : activeCategory?.name ?? "Catálogo"}
          </h1>
          <p className="mt-1 text-sm text-grafito">
            {catalog.total === 1 ? "1 pieza" : `${catalog.total} piezas`}
            {filters.disponibles ? (catalog.total === 1 ? " disponible" : " disponibles") : ""}
          </p>
        </div>
      </div>

      <div className="grid gap-12 lg:grid-cols-[15rem_1fr]">
        <form action="/catalogo" className="space-y-7 text-sm" aria-label="Filtros del catálogo">
          {filters.q && <input type="hidden" name="q" value={filters.q} />}

          <fieldset>
            <legend className="mb-2 font-medium">Categoría</legend>
            <select name="categoria" defaultValue={filters.categoria ?? ""} className="w-full border border-linea bg-white px-2 py-2">
              <option value="">Todas</option>
              {categories.filter((c) => c.is_enabled).map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-medium">Marca</legend>
            <select name="marca" defaultValue={filters.marca ?? ""} className="w-full border border-linea bg-white px-2 py-2">
              <option value="">Todas</option>
              {brands.map((b) => (
                <option key={b.slug} value={b.slug}>{b.name} ({b.count})</option>
              ))}
            </select>
          </fieldset>

          {sizes.length > 0 && (
            <fieldset>
              <legend className="mb-2 font-medium">Talla</legend>
              <select name="talla" defaultValue={filters.talla ?? ""} className="w-full border border-linea bg-white px-2 py-2">
                <option value="">Todas</option>
                {sizes.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </fieldset>
          )}

          <fieldset>
            <legend className="mb-2 font-medium">Precio en MXN</legend>
            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="min">Precio mínimo</label>
              <input id="min" name="min" type="number" min={0} step={100} inputMode="numeric" placeholder="Mínimo" defaultValue={filters.min ?? ""} className="w-full border border-linea bg-white px-2 py-2" />
              <span aria-hidden className="text-piedra">a</span>
              <label className="sr-only" htmlFor="max">Precio máximo</label>
              <input id="max" name="max" type="number" min={0} step={100} inputMode="numeric" placeholder="Máximo" defaultValue={filters.max ?? ""} className="w-full border border-linea bg-white px-2 py-2" />
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-medium">Condición verificada</legend>
            <select name="condicion" defaultValue={filters.condicion ?? ""} className="w-full border border-linea bg-white px-2 py-2">
              <option value="">Cualquiera</option>
              {[9, 8, 7, 6, 5].map((n) => (
                <option key={n} value={n}>{n} o más</option>
              ))}
            </select>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-2 font-medium">Mostrar</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="fullset" value="1" defaultChecked={filters.fullset} className="accent-tinta" />
              Solo full set
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="disponibles" value="0" defaultChecked={!filters.disponibles} className="accent-tinta" />
              Incluir vendidas
            </label>
          </fieldset>

          <fieldset>
            <legend className="mb-2 font-medium">Ordenar por</legend>
            <select name="orden" defaultValue={filters.orden} className="w-full border border-linea bg-white px-2 py-2">
              <option value="recientes">Más recientes</option>
              <option value="precio_asc">Precio: menor a mayor</option>
              <option value="precio_desc">Precio: mayor a menor</option>
            </select>
          </fieldset>

          <div className="flex items-center gap-4">
            <button type="submit" className="bg-tinta px-5 py-2.5 text-papel hover:bg-grafito">
              Aplicar filtros
            </button>
            {hasFilters && (
              <Link href="/catalogo" className="underline underline-offset-4">
                Quitar filtros
              </Link>
            )}
          </div>
        </form>

        <section aria-label="Piezas">
          {catalog.items.length > 0 ? (
            <>
              <ProductGrid products={catalog.items} />
              {pages > 1 && (
                <nav aria-label="Paginación" className="mt-14 flex items-center justify-between text-sm">
                  {filters.pagina > 1 ? (
                    <Link href={hrefWith(filters, { pagina: filters.pagina - 1 })} className="underline underline-offset-4">
                      Página anterior
                    </Link>
                  ) : <span />}
                  <span className="text-grafito">Página {filters.pagina} de {pages}</span>
                  {filters.pagina < pages ? (
                    <Link href={hrefWith(filters, { pagina: filters.pagina + 1 })} className="underline underline-offset-4">
                      Página siguiente
                    </Link>
                  ) : <span />}
                </nav>
              )}
            </>
          ) : hasFilters ? (
            <EmptyState title="Ninguna pieza coincide con estos filtros" action={{ href: "/catalogo", label: "Quitar filtros" }}>
              Prueba con un rango de precio más amplio o quita la marca seleccionada.
            </EmptyState>
          ) : (
            <EmptyState title="Las primeras piezas están en autenticación" action={{ href: "/vender", label: "Consignar una pieza" }}>
              Publicamos cada pieza en cuanto termina su revisión física.
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}
