import "server-only";
import { z } from "zod";
import { dbConfigured, query } from "@/lib/db";
import { pesosToCents } from "@/lib/domain/money";

export interface CatalogProduct {
  id: string;
  slug: string;
  sku: string;
  model: string;
  description: string | null;
  size_label: string | null;
  size_system: string | null;
  fit: string | null;
  declared_condition: string;
  final_condition_score: string | null; // numeric llega como texto desde pg
  includes: string[];
  listed_price_cents: string; // bigint llega como texto desde pg
  status: string;
  is_featured: boolean;
  received_at: Date | null;
  published_at: Date | null;
  sold_at: Date | null;
  category_slug: string;
  category_name: string;
  brand_slug: string;
  brand_name: string;
  authentication_result: string | null;
  authenticated_at: Date | null;
  external_provider: string | null;
  cover_url: string | null;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  is_enabled: boolean;
}

export const PAGE_SIZE = 24;

const COLUMNS = `id, slug, sku, model, description, size_label, size_system, fit, declared_condition,
  final_condition_score, includes::text[] as includes, listed_price_cents, status, is_featured, received_at, published_at, sold_at,
  category_slug, category_name, brand_slug, brand_name, authentication_result, authenticated_at,
  external_provider, cover_url`;

const SORTS = ["recientes", "precio_asc", "precio_desc"] as const;
export type SortKey = (typeof SORTS)[number];

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

/** Filtros del catálogo leídos de la URL. Todo se valida en servidor. */
export const catalogFiltersSchema = z.object({
  q: z.preprocess((v) => emptyToUndefined(first(v)), z.string().trim().max(80).optional()),
  categoria: z.preprocess((v) => emptyToUndefined(first(v)), z.string().regex(/^[a-z0-9-]+$/).optional()),
  marca: z.preprocess((v) => emptyToUndefined(first(v)), z.string().regex(/^[a-z0-9-]+$/).optional()),
  talla: z.preprocess((v) => emptyToUndefined(first(v)), z.string().trim().max(12).optional()),
  min: z.preprocess((v) => emptyToUndefined(first(v)), z.coerce.number().min(0).max(10_000_000).optional()),
  max: z.preprocess((v) => emptyToUndefined(first(v)), z.coerce.number().min(0).max(10_000_000).optional()),
  condicion: z.preprocess((v) => emptyToUndefined(first(v)), z.coerce.number().int().min(1).max(10).optional()),
  fullset: z.preprocess((v) => first(v) === "1", z.boolean()),
  disponibles: z.preprocess((v) => first(v) !== "0", z.boolean()),
  orden: z.preprocess((v) => emptyToUndefined(first(v)), z.enum(SORTS).default("recientes")),
  pagina: z.preprocess((v) => emptyToUndefined(first(v)), z.coerce.number().int().min(1).max(500).default(1)),
});
export type CatalogFilters = z.infer<typeof catalogFiltersSchema>;

export function parseFilters(params: Record<string, string | string[] | undefined>): CatalogFilters {
  const parsed = catalogFiltersSchema.safeParse(params);
  return parsed.success ? parsed.data : catalogFiltersSchema.parse({});
}

export class CatalogUnavailableError extends Error {}

function ensureDb() {
  if (!dbConfigured()) throw new CatalogUnavailableError("La base de datos no está configurada");
}

export async function getCatalog(f: CatalogFilters): Promise<{ items: CatalogProduct[]; total: number }> {
  ensureDb();
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };

  if (f.disponibles) where.push("status = 'publicada'");
  if (f.categoria) add("category_slug = ?", f.categoria);
  if (f.marca) add("brand_slug = ?", f.marca);
  if (f.talla) add("size_label = ?", f.talla);
  if (f.min !== undefined) add("listed_price_cents >= ?", pesosToCents(f.min));
  if (f.max !== undefined) add("listed_price_cents <= ?", pesosToCents(f.max));
  if (f.condicion !== undefined) add("final_condition_score >= ?", f.condicion);
  if (f.fullset) where.push("'full_set' = any(includes)");
  if (f.q) add("search @@ websearch_to_tsquery('simple', unaccent(?))", f.q);

  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const order =
    f.orden === "precio_asc"
      ? "listed_price_cents asc, published_at desc"
      : f.orden === "precio_desc"
        ? "listed_price_cents desc, published_at desc"
        : "published_at desc";

  params.push(PAGE_SIZE, (f.pagina - 1) * PAGE_SIZE);
  const rows = await query<CatalogProduct & { total: string }>(
    `select ${COLUMNS}, count(*) over () as total
     from catalog_products ${whereSql}
     order by ${order}
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return { items: rows, total: rows.length ? Number(rows[0].total) : 0 };
}

export async function getLatest(limit: number): Promise<CatalogProduct[]> {
  ensureDb();
  return query<CatalogProduct>(
    `select ${COLUMNS} from catalog_products where status = 'publicada' order by published_at desc limit $1`,
    [limit],
  );
}

export async function getFeatured(limit: number): Promise<CatalogProduct[]> {
  ensureDb();
  return query<CatalogProduct>(
    `select ${COLUMNS} from catalog_products where status = 'publicada' and is_featured order by published_at desc limit $1`,
    [limit],
  );
}

/** Solo ventas reales: piezas con fecha de venta registrada. */
export async function getRecentlySold(limit: number): Promise<CatalogProduct[]> {
  ensureDb();
  return query<CatalogProduct>(
    `select ${COLUMNS} from catalog_products where sold_at is not null and status <> 'publicada'
     order by sold_at desc limit $1`,
    [limit],
  );
}

export async function getCategories(): Promise<Category[]> {
  ensureDb();
  return query<Category>("select id, slug, name, is_enabled from product_categories order by sort_order");
}

/** Marcas con al menos una pieza disponible y su conteo. */
export async function getBrandsInStock(): Promise<{ slug: string; name: string; count: number }[]> {
  ensureDb();
  const rows = await query<{ slug: string; name: string; count: string }>(
    `select brand_slug as slug, brand_name as name, count(*) as count
     from catalog_products where status = 'publicada'
     group by brand_slug, brand_name order by count(*) desc, brand_name`,
  );
  return rows.map((r) => ({ ...r, count: Number(r.count) }));
}

export async function getSizesInStock(): Promise<string[]> {
  ensureDb();
  const rows = await query<{ size_label: string }>(
    "select distinct size_label from catalog_products where status = 'publicada' and size_label is not null",
  );
  return rows.map((r) => r.size_label).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
}

export interface ProductDetail {
  product: CatalogProduct;
  images: { id: string; kind: string; url: string; caption: string | null }[];
  assessment: { score: string | null; summary: string | null; defects: { area: string; description: string }[] } | null;
  similar: CatalogProduct[];
}

export async function getProductDetail(slug: string): Promise<ProductDetail | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  ensureDb();
  const [product] = await query<CatalogProduct>(`select ${COLUMNS} from catalog_products where slug = $1`, [slug]);
  if (!product) return null;

  const [images, assessments, similar] = await Promise.all([
    query<ProductDetail["images"][number]>(
      `select id, kind, url, caption from product_images
       where product_id = $1 and kind in ('final', 'defecto') order by kind desc, sort_order`,
      [product.id],
    ),
    query<{ score: string | null; summary: string | null; defects: unknown }>(
      `select score, summary, defects from condition_assessments
       where product_id = $1 and source = 'humana' order by created_at desc limit 1`,
      [product.id],
    ),
    query<CatalogProduct>(
      `select ${COLUMNS} from catalog_products
       where status = 'publicada' and category_slug = $1 and id <> $2
       order by published_at desc limit 4`,
      [product.category_slug, product.id],
    ),
  ]);

  const a = assessments[0];
  return {
    product,
    images,
    assessment: a
      ? { score: a.score, summary: a.summary, defects: Array.isArray(a.defects) ? (a.defects as { area: string; description: string }[]) : [] }
      : null,
    similar,
  };
}

export async function getPublicSetting<T>(key: string, fallback: T): Promise<T> {
  if (!dbConfigured()) return fallback;
  const rows = await query<{ value: T }>("select value from platform_settings where key = $1", [`public.${key}`]);
  return rows[0]?.value ?? fallback;
}
