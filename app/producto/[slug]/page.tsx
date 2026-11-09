import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FichaRows, FichaShell, type FichaRow } from "@/components/ficha";
import { ProductGrid } from "@/components/product-card";
import { ConfigNotice } from "@/components/notices";
import { CatalogUnavailableError, getProductDetail, getPublicSetting } from "@/lib/catalog";
import { formatMXN } from "@/lib/domain/money";
import {
  conditionScaleLabel,
  DECLARED_CONDITION_LABEL,
  FIT_LABEL,
  formatDate,
  formatScore,
  INCLUDED_ITEM_LABEL,
} from "@/lib/domain/labels";
import { whatsappLink } from "@/config/site";

type Params = { slug: string };

export const revalidate = 60;

async function load(slug: string) {
  try {
    return { ok: true as const, detail: await getProductDetail(slug) };
  } catch (e) {
    if (e instanceof CatalogUnavailableError) return { ok: false as const };
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = params;
  const res = await load(slug);
  if (!res.ok || !res.detail) return { title: "Pieza no encontrada" };
  const p = res.detail.product;
  return {
    title: `${p.brand_name} ${p.model}`,
    description: `${p.brand_name} ${p.model} preloved, autenticado físicamente. ${formatMXN(Number(p.listed_price_cents))}.`,
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const { slug } = params;
  const res = await load(slug);
  if (!res.ok) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-8">
        <ConfigNotice />
      </div>
    );
  }
  if (!res.detail) notFound();

  const { product: p, images, assessment, similar } = res.detail;
  const acceptanceHours = await getPublicSetting<number>("acceptance_window_hours", 72);
  const available = p.status === "publicada";
  const score = p.final_condition_score !== null ? Number(p.final_condition_score) : null;
  const finals = images.filter((i) => i.kind === "final");
  const defects = images.filter((i) => i.kind === "defecto");
  const contact = whatsappLink(`Hola, me interesa la pieza ${p.sku}: ${p.brand_name} ${p.model}.`);

  const ficha: FichaRow[] = [{ label: "Pieza", value: p.sku }];
  if (p.received_at) ficha.push({ label: "Recibida", value: formatDate(p.received_at) });
  if (p.authentication_result === "autentica") {
    ficha.push({
      label: "Autenticación física",
      value: p.authenticated_at ? `Aprobada el ${formatDate(p.authenticated_at)}` : "Aprobada",
      verified: true,
    });
  }
  if (score !== null) {
    ficha.push({ label: "Condición verificada", value: `${formatScore(score)}/10, ${conditionScaleLabel(score).toLowerCase()}`, verified: true });
  }
  if (p.external_provider) ficha.push({ label: "Certificado externo", value: p.external_provider, verified: true });
  if (p.published_at) ficha.push({ label: "Publicada", value: formatDate(p.published_at) });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <nav aria-label="Ruta" className="mb-8 text-sm text-grafito">
        <Link href="/catalogo" className="hover:underline">Catálogo</Link>
        <span aria-hidden className="mx-2 text-piedra">/</span>
        <Link href={`/catalogo?categoria=${p.category_slug}`} className="hover:underline">{p.category_name}</Link>
      </nav>

      <div className="grid gap-12 lg:grid-cols-[1.35fr_1fr]">
        <section aria-label="Fotografías" className="grid grid-cols-2 gap-2">
          {finals.length === 0 && <div className="col-span-2 aspect-[4/5] bg-muro" />}
          {finals.map((img, i) => {
            const src = img.url;
            return src ? (
              <figure key={img.id} className={`relative bg-muro ${i === 0 ? "col-span-2 aspect-[4/5]" : "aspect-square"}`}>
                <Image
                  src={src}
                  alt={img.caption ?? `${p.brand_name} ${p.model}, foto ${i + 1}`}
                  fill
                  priority={i === 0}
                  sizes={i === 0 ? "(min-width: 1024px) 55vw, 100vw" : "(min-width: 1024px) 27vw, 50vw"}
                  className="object-cover"
                />
              </figure>
            ) : null;
          })}
        </section>

        <div className="lg:sticky lg:top-8 lg:self-start">
          <p className="text-sm text-grafito">{p.category_name}</p>
          <h1 className="mt-1 font-display text-title">{p.brand_name}</h1>
          <p className="mt-1 text-lg">{p.model}</p>
          <p className="mt-5 text-2xl">{formatMXN(Number(p.listed_price_cents))}</p>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {p.size_label && (
              <div>
                <dt className="text-piedra">Talla</dt>
                <dd>{p.size_label}{p.size_system && p.size_system !== "UNICA" ? ` ${p.size_system}` : ""}</dd>
              </div>
            )}
            {p.fit && (
              <div>
                <dt className="text-piedra">Ajuste</dt>
                <dd>{FIT_LABEL[p.fit]}</dd>
              </div>
            )}
            <div>
              <dt className="text-piedra">Condición declarada por quien vende</dt>
              <dd>{DECLARED_CONDITION_LABEL[p.declared_condition]}</dd>
            </div>
            <div>
              <dt className="text-piedra">Condición verificada por nosotros</dt>
              <dd>{score !== null ? `${formatScore(score)}/10` : "Pendiente"}</dd>
            </div>
          </dl>

          <div className="mt-8 space-y-3">
            {available ? (
              contact ? (
                <a href={contact} className="block bg-tinta px-6 py-3.5 text-center text-papel hover:bg-grafito">
                  Apartar por WhatsApp
                </a>
              ) : (
                <p className="border border-linea px-4 py-3 text-sm text-grafito">
                  La compra en línea se habilita en la siguiente fase. Configura <code>NEXT_PUBLIC_WHATSAPP_NUMBER</code> para recibir apartados mientras tanto.
                </p>
              )
            ) : (
              <p className="border border-linea px-4 py-3 text-sm">{p.status === "reservada" ? "Esta pieza está reservada." : "Esta pieza ya se vendió."}</p>
            )}
            <p className="text-sm text-grafito">
              Entrega en Guadalajara y zona metropolitana, o recoge en sucursal. Tienes {acceptanceHours} horas después de recibirla para reportar cualquier problema.
            </p>
          </div>

          <FichaShell className="mt-10">
            <p className="mb-2 font-display text-xl">Ficha de la pieza</p>
            <FichaRows rows={ficha} />
          </FichaShell>
        </div>
      </div>

      <div className="mt-16 grid gap-12 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-10">
          {p.description && (
            <section>
              <h2 className="mb-3 font-display text-2xl">Descripción</h2>
              <p className="max-w-[68ch] whitespace-pre-line text-grafito">{p.description}</p>
            </section>
          )}

          {(assessment?.summary || (assessment?.defects.length ?? 0) > 0 || defects.length > 0) && (
            <section>
              <h2 className="mb-3 font-display text-2xl">Estado de la pieza</h2>
              {assessment?.summary && <p className="max-w-[68ch] text-grafito">{assessment.summary}</p>}
              {assessment && assessment.defects.length > 0 && (
                <ul className="mt-4 space-y-2 text-sm">
                  {assessment.defects.map((d, i) => (
                    <li key={i} className="grid grid-cols-[8rem_1fr] gap-3 border-b border-linea pb-2">
                      <span className="text-piedra">{d.area}</span>
                      <span>{d.description}</span>
                    </li>
                  ))}
                </ul>
              )}
              {defects.length > 0 && (
                <div className="mt-6 grid grid-cols-3 gap-2">
                  {defects.map((img) => {
                    const src = img.url;
                    return src ? (
                      <figure key={img.id}>
                        <div className="relative aspect-square bg-muro">
                          <Image src={src} alt={img.caption ?? "Detalle de desgaste"} fill sizes="20vw" className="object-cover" />
                        </div>
                        {img.caption && <figcaption className="mt-1 text-xs text-grafito">{img.caption}</figcaption>}
                      </figure>
                    ) : null;
                  })}
                </div>
              )}
            </section>
          )}
        </div>

        {p.includes.length > 0 && (
          <section>
            <h2 className="mb-3 font-display text-2xl">Qué incluye</h2>
            <ul className="space-y-1.5 text-sm">
              {p.includes.map((i) => (
                <li key={i}>{INCLUDED_ITEM_LABEL[i] ?? i}</li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-piedra">
              Una caja, un ticket o un certificado no garantizan la autenticidad por sí solos; la autenticidad se determina en la revisión física.
            </p>
          </section>
        )}
      </div>

      {similar.length > 0 && (
        <section className="mt-24" aria-labelledby="similares">
          <h2 id="similares" className="mb-8 font-display text-title">
            También en {p.category_name}
          </h2>
          <ProductGrid products={similar} />
        </section>
      )}
    </div>
  );
}
