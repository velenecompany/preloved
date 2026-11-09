import Image from "next/image";
import Link from "next/link";
import type { CatalogProduct } from "@/lib/catalog";
import { formatMXN } from "@/lib/domain/money";
import { formatScore } from "@/lib/domain/labels";

export function ProductCard({ product, priority = false }: { product: CatalogProduct; priority?: boolean }) {
  const src = product.cover_url;
  const sold = product.status !== "publicada";
  return (
    <Link href={`/producto/${product.slug}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden bg-muro">
        {src ? (
          <Image
            src={src}
            alt={`${product.brand_name} ${product.model}`}
            fill
            priority={priority}
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className={`object-cover transition-transform duration-500 group-hover:scale-[1.02] ${sold ? "opacity-60" : ""}`}
          />
        ) : null}
        {sold && (
          <span className="absolute left-3 top-3 bg-papel px-2 py-0.5 text-xs text-grafito">
            {product.status === "reservada" ? "Reservada" : "Vendida"}
          </span>
        )}
      </div>
      <div className="mt-3 space-y-0.5 text-sm">
        <p className="font-medium">{product.brand_name}</p>
        <p className="line-clamp-1 text-grafito">{product.model}</p>
        <div className="flex items-baseline justify-between gap-2 pt-1">
          <p>{formatMXN(Number(product.listed_price_cents))}</p>
          {product.final_condition_score !== null && (
            <p className="text-xs text-piedra">Condición {formatScore(Number(product.final_condition_score))}/10</p>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: CatalogProduct[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < 4} />
        </li>
      ))}
    </ul>
  );
}
