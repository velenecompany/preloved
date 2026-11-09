import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole, requireRole } from "@/lib/auth/session";
import { activeRules, getRequestForReview } from "@/lib/consignment/service";
import { aiConfigured } from "@/lib/consignment/ai";
import { sellerStatus } from "@/lib/consignment/labels";
import { photoGuideFor, POSSESSION_SLOT } from "@/lib/domain/photo-guide";
import { DECLARED_CONDITION_LABEL, FIT_LABEL, formatDate, INCLUDED_ITEM_LABEL } from "@/lib/domain/labels";
import { formatMXN } from "@/lib/domain/money";
import { AiAssessmentCard } from "@/components/consignment/assessment";
import { ReviewForms, RunAssessmentButton } from "@/components/consignment/review-forms";
import { acceptBrandAction, decideAction } from "../actions";

export const metadata: Metadata = { title: "Revisar solicitud" };
export const dynamic = "force-dynamic";

export default async function ReviewPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await requireRole(["admin", "autenticador"], `/admin/solicitudes/${params.id}`);
  const r = await getRequestForReview(params.id);
  if (!r) notFound();

  const rules = await activeRules(r.commission_group);
  const guide = photoGuideFor(r.category_slug);
  const labelOf = (slot: string | null) => guide.find((g) => g.slot === slot)?.label ?? "Otra";
  const possession = r.photos.find((p) => p.slot === POSSESSION_SLOT);
  const preliminary = r.photos.filter((p) => p.kind === "preliminar");
  const latest = r.rounds[0];
  const pending = r.status === "solicitud_enviada";

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin/solicitudes" className="text-sm text-grafito underline underline-offset-4">
          Solicitudes
        </Link>
        <h2 className="mt-3 font-display text-2xl">
          {r.brand_name} <span className="text-grafito">{r.model}</span>
        </h2>
        <p className="mt-1 text-sm text-grafito">
          {sellerStatus(r.status).label}. De {r.seller_name ?? "sin nombre"} ({r.seller_email}), creada el {formatDate(r.created_at)}.
        </p>
      </div>

      {!r.brand_accepted && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-tinta bg-white px-5 py-4 text-sm">
          <p>
            <span className="font-medium">{r.brand_name}</span> no está en la lista de marcas aceptadas. El vendedor la escribió a mano.
          </p>
          {hasRole(me, "admin") && (
            <form action={acceptBrandAction.bind(null, r.id, r.brand_slug)}>
              <button type="submit" className="underline underline-offset-4">Aceptar esta marca</button>
            </form>
          )}
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-10">
          <section aria-label="Fotos">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {preliminary.map((p) => (
                <li key={p.id}>
                  <a href={p.url} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={labelOf(p.slot)} className="aspect-square w-full bg-muro object-cover" />
                  </a>
                  <p className="mt-1 text-xs text-grafito">{labelOf(p.slot)}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-5 border-t border-linea pt-8 sm:grid-cols-[auto_1fr]">
            <div>
              <p className="text-sm text-grafito">Código esperado</p>
              <p className="font-display text-3xl tracking-wider">{r.possession_code}</p>
            </div>
            {possession ? (
              <a href={possession.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={possession.url} alt="Prueba de posesión" className="max-h-72 bg-muro object-contain" />
                <span className="mt-1 block text-xs text-grafito">Revisa que el código escrito coincida y que la pieza sea la misma de las fotos.</span>
              </a>
            ) : (
              <p className="text-sm">Sin foto de prueba de posesión.</p>
            )}
          </section>

          <section className="border-t border-linea pt-8">
            {r.aiAssessment ? (
              <AiAssessmentCard assessment={r.aiAssessment} audience="equipo" />
            ) : (
              <p className="text-sm text-grafito">
                {aiConfigured() ? "Todavía no hay lectura de condición con IA." : "La lectura con IA está apagada: falta GROQ_API_KEY."}
              </p>
            )}
            {pending && aiConfigured() && (
              <div className="mt-3">
                <RunAssessmentButton productId={r.id} hasAssessment={Boolean(r.aiAssessment)} />
              </div>
            )}
          </section>
        </div>

        <div className="space-y-8">
          <dl className="space-y-2.5 text-sm">
            {[
              ["Categoría", r.category_name],
              ["Talla", r.size_label ? `${r.size_label}${r.size_system && r.size_system !== "UNICA" ? ` ${r.size_system}` : ""}` : "No aplica"],
              ["Ajuste", r.fit ? FIT_LABEL[r.fit] : "No aplica"],
              ["Condición declarada", DECLARED_CONDITION_LABEL[r.declared_condition]],
              ["Incluye", r.includes.length ? r.includes.map((i) => INCLUDED_ITEM_LABEL[i]).join(", ") : "Nada adicional"],
              ["Precio que espera", formatMXN(Number(r.asking_price_cents))],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 border-b border-linea pb-2">
                <dt className="text-piedra">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {r.description && <p className="whitespace-pre-line text-sm text-grafito">{r.description}</p>}

          {r.rounds.length > 1 && (
            <div className="text-sm">
              <p className="mb-2 font-medium">Rondas</p>
              <ul className="space-y-2 text-grafito">
                {[...r.rounds].reverse().map((round) => (
                  <li key={round.round}>
                    {round.round}. Pidió {formatMXN(Number(round.seller_price_cents))}
                    {round.offered_price_cents ? `, propusimos ${formatMXN(Number(round.offered_price_cents))}` : ""}
                    {round.seller_note ? `. Nota: “${round.seller_note}”` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pending ? (
            <ReviewForms action={decideAction.bind(null, r.id)} askingPesos={Number(latest.seller_price_cents) / 100} group={r.commission_group} rules={rules} />
          ) : (
            <p className="border border-linea bg-white px-5 py-4 text-sm">
              Esta solicitud ya no está pendiente de revisión: {sellerStatus(r.status).label.toLowerCase()}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
