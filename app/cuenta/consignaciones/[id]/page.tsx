import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getPayoutAccount } from "@/lib/auth/service";
import {
  activeRules,
  commissionPreview,
  EDITABLE_STATUSES,
  getAcceptedBrands,
  getEnabledCategories,
  getSellerRequest,
  submissionBlockers,
  type RequestDetail,
} from "@/lib/consignment/service";
import { sellerStatus } from "@/lib/consignment/labels";
import { photoGuideFor, POSSESSION_SLOT } from "@/lib/domain/photo-guide";
import { DECLARED_CONDITION_LABEL, INCLUDED_ITEM_LABEL } from "@/lib/domain/labels";
import { formatMXN } from "@/lib/domain/money";
import { PieceForm } from "@/components/consignment/piece-form";
import { PhotoSlotField } from "@/components/consignment/photo-uploader";
import { AiAssessmentCard } from "@/components/consignment/assessment";
import {
  AcceptOfferForm,
  ConfirmButton,
  CounterOfferForm,
  EvaluateOnArrival,
  SubmitRequestForm,
} from "@/components/consignment/seller-actions";
import {
  acceptOfferAction,
  counterOfferAction,
  submitAction,
  updateDraftAction,
  withdrawAction,
} from "../actions";

export const metadata: Metadata = { title: "Solicitud de consignación" };
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  enviada: "Enviamos tu solicitud a revisión. Te avisamos por correo cuando tengamos respuesta.",
  aceptada: "Aceptaste la propuesta. Te contactamos para agendar la entrega o la recolección.",
  contrapropuesta: "Enviamos tu contrapropuesta. Te respondemos por correo.",
};

const WITHDRAWABLE = ["solicitud_borrador", "requiere_informacion", "preaprobada", "pendiente_de_entrega"];

export default async function RequestPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string; paso?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const user = await requireUser(`/cuenta/consignaciones/${params.id}`);
  const r = await getSellerRequest(user.id, params.id);
  if (!r) notFound();

  const status = sellerStatus(r.status);
  const editable = EDITABLE_STATUSES.includes(r.status);
  const latest = r.rounds[0];
  const notice = searchParams.aviso ? NOTICES[searchParams.aviso] : undefined;

  return (
    <div className="space-y-12">
      <div>
        <Link href="/cuenta/consignaciones" className="text-sm text-grafito underline underline-offset-4">
          Mis consignaciones
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl">
              {r.brand_name} <span className="text-grafito">{r.model}</span>
            </h2>
            <p className="mt-1">
              <span className="font-medium">{status.label}.</span> <span className="text-grafito">{status.next}</span>
            </p>
          </div>
          {WITHDRAWABLE.includes(r.status) && (
            <ConfirmButton
              action={withdrawAction.bind(null, r.id)}
              label="Retirar solicitud"
              confirm={r.status === "solicitud_borrador" ? "¿Descartar este borrador?" : "¿Retirar esta solicitud?"}
            />
          )}
        </div>
      </div>

      {notice && <p role="status" className="border-l-2 border-tinta bg-white px-4 py-3 text-sm">{notice}</p>}
      {searchParams.aviso === "enviada" && r.status === "solicitud_enviada" && !r.aiAssessment && <EvaluateOnArrival productId={r.id} />}

      {r.status === "requiere_informacion" && latest?.admin_notes && (
        <div className="border-l-2 border-tinta bg-white px-5 py-4">
          <p className="font-medium">Lo que necesitamos</p>
          <p className="mt-1 whitespace-pre-line text-grafito">{latest.admin_notes}</p>
        </div>
      )}
      {r.status === "rechazada" && latest?.rejection_reason && (
        <div className="border-l-2 border-tinta bg-white px-5 py-4">
          <p className="font-medium">Motivo</p>
          <p className="mt-1 whitespace-pre-line text-grafito">{latest.rejection_reason}</p>
        </div>
      )}

      {r.status === "preaprobada" && latest?.offered_price_cents && <OfferSection r={r} userId={user.id} />}

      {editable ? <EditableRequest r={r} userId={user.id} step={searchParams.paso} /> : <ReadOnlyRequest r={r} />}
    </div>
  );
}

async function OfferSection({ r, userId }: { r: RequestDetail; userId: string }) {
  const latest = r.rounds[0];
  const offer = Number(latest.offered_price_cents);
  const [breakdown, payout] = await Promise.all([commissionPreview(r.commission_group, offer), getPayoutAccount(userId)]);

  return (
    <section className="grid gap-10 border border-tinta bg-white px-6 py-7 md:grid-cols-[1fr_1fr]">
      <div>
        <h3 className="font-display text-2xl">Nuestra propuesta</h3>
        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between gap-6 border-b border-linea pb-2">
            <dt className="text-grafito">Precio de publicación</dt>
            <dd className="text-base">{formatMXN(breakdown.salePriceCents)}</dd>
          </div>
          <div className="flex justify-between gap-6 border-b border-linea pb-2">
            <dt className="text-grafito">Comisión ({breakdown.rateBps / 100} %)</dt>
            <dd>{formatMXN(breakdown.commissionCents)}</dd>
          </div>
          <div className="flex justify-between gap-6">
            <dt className="font-medium">Recibes al venderse</dt>
            <dd className="text-base font-medium">{formatMXN(breakdown.sellerGrossCents)}</dd>
          </div>
        </dl>
        {latest.admin_notes && <p className="mt-5 whitespace-pre-line text-sm text-grafito">{latest.admin_notes}</p>}
        <p className="mt-5 text-xs text-piedra">
          La propuesta depende de la autenticación física y de que la condición coincida con las fotos. La pieza se queda con nosotros al menos 30 días.
        </p>
      </div>
      <div className="space-y-8">
        {payout ? (
          <AcceptOfferForm action={acceptOfferAction.bind(null, r.id)} />
        ) : (
          <p className="text-sm">
            Para aceptar, primero{" "}
            <Link href="/cuenta/datos-bancarios" className="underline underline-offset-4">
              registra tus datos bancarios
            </Link>
            ; ahí te pagamos cuando se venda.
          </p>
        )}
        <details className="border-t border-linea pt-5">
          <summary className="cursor-pointer text-sm underline underline-offset-4">Proponer otro precio</summary>
          <div className="mt-4">
            <CounterOfferForm action={counterOfferAction.bind(null, r.id)} />
          </div>
        </details>
      </div>
    </section>
  );
}

async function EditableRequest({ r, userId, step }: { r: RequestDetail; userId: string; step?: string }) {
  const [categories, brands] = await Promise.all([getEnabledCategories(), getAcceptedBrands()]);
  const groups = [...new Set(categories.map((c) => c.commission_group))];
  const rules = (await Promise.all(groups.map(activeRules))).flat();
  const guide = photoGuideFor(r.category_slug);
  const blockers = submissionBlockers(r);
  const possession = r.photos.filter((p) => p.slot === POSSESSION_SLOT);
  const preliminary = r.photos.filter((p) => p.kind === "preliminar");

  return (
    <>
      <section aria-labelledby="datos">
        <details open={step === "datos"} className="group border-y border-linea py-5">
          <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-3">
            <span id="datos" className="font-display text-xl">1. Datos de la pieza</span>
            <span className="text-sm text-grafito underline underline-offset-4 group-open:hidden">Editar</span>
          </summary>
          <p className="mt-2 text-sm text-grafito">
            {r.category_name}, {DECLARED_CONDITION_LABEL[r.declared_condition].toLowerCase()}, esperas {formatMXN(Number(r.asking_price_cents))}.
          </p>
          <div className="mt-6 max-w-2xl">
            <PieceForm
              action={updateDraftAction.bind(null, r.id)}
              categories={categories}
              brands={brands}
              rules={rules}
              initial={{
                categorySlug: r.category_slug,
                brandSlug: r.brand_accepted ? r.brand_slug : "",
                brandName: r.brand_accepted ? "" : r.brand_name,
                model: r.model,
                sizeLabel: r.size_label ?? "",
                sizeSystem: r.size_system ?? "",
                fit: r.fit ?? "",
                declaredCondition: r.declared_condition,
                includes: r.includes,
                description: r.description ?? "",
                askingPrice: String(Number(r.asking_price_cents) / 100),
              }}
              submitLabel="Guardar cambios"
              pendingLabel="Guardando…"
            />
          </div>
        </details>
      </section>

      {r.aiAssessment && r.status === "requiere_informacion" && <AiAssessmentCard assessment={r.aiAssessment} audience="vendedor" />}

      <section aria-labelledby="fotos">
        <h3 id="fotos" className="font-display text-xl">2. Fotos</h3>
        <p className="mt-1 max-w-[68ch] text-sm text-grafito">
          Con luz natural, sobre un fondo liso y sin filtros. Las obligatorias nos permiten darte una propuesta; las demás la hacen más precisa.
        </p>
        <div className="mt-3">
          {guide.map((slot) => (
            <PhotoSlotField
              key={slot.slot}
              productId={r.id}
              userId={userId}
              slot={slot}
              photos={preliminary.filter((p) => p.slot === slot.slot)}
              editable
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="posesion">
        <h3 id="posesion" className="font-display text-xl">3. Confirma que la tienes</h3>
        <div className="mt-3 grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
          <p className="border border-tinta bg-white px-6 py-4 text-center font-display text-4xl tracking-wider">{r.possession_code}</p>
          <p className="max-w-[60ch] text-sm text-grafito">
            Escribe este código a mano en un papel y toma una foto de la pieza junto al papel. Así confirmamos que la tienes contigo antes de proponerte un precio.
          </p>
        </div>
        <PhotoSlotField
          productId={r.id}
          userId={userId}
          slot={{ slot: POSSESSION_SLOT, label: "Foto con el código", hint: "La pieza y el papel con el código, en la misma foto.", required: true }}
          photos={possession}
          editable
        />
      </section>

      <section aria-labelledby="enviar" className="border border-linea bg-white px-6 py-6">
        <h3 id="enviar" className="font-display text-xl">Enviar a revisión</h3>
        {blockers.length > 0 ? (
          <>
            <p className="mt-2 text-sm">Antes de enviar, falta:</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-grafito">
              {blockers.map((b) => (
                <li key={b}>{b.replace(/^Falta (la foto: )?/, "")}</li>
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-grafito">
              Revisamos tus fotos y te respondemos por correo con una propuesta de precio y comisión, o te pedimos más información.
            </p>
            <SubmitRequestForm action={submitAction.bind(null, r.id)} />
          </div>
        )}
      </section>
    </>
  );
}

function ReadOnlyRequest({ r }: { r: RequestDetail }) {
  const preliminary = r.photos.filter((p) => p.kind === "preliminar");
  return (
    <>
      {r.aiAssessment && r.status === "solicitud_enviada" && <AiAssessmentCard assessment={r.aiAssessment} audience="vendedor" />}
      <section className="grid gap-10 md:grid-cols-[1fr_1.2fr]">
        <dl className="space-y-3 text-sm">
          {[
            ["Categoría", r.category_name],
            ["Talla", r.size_label ? `${r.size_label}${r.size_system && r.size_system !== "UNICA" ? ` ${r.size_system}` : ""}` : "No aplica"],
            ["Condición declarada", DECLARED_CONDITION_LABEL[r.declared_condition]],
            ["Incluye", r.includes.length ? r.includes.map((i) => INCLUDED_ITEM_LABEL[i]).join(", ") : "Nada adicional"],
            ["Precio que esperas", formatMXN(Number(r.asking_price_cents))],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[10rem_1fr] gap-3 border-b border-linea pb-2">
              <dt className="text-piedra">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {preliminary.map((p) => (
            <li key={p.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.slot ?? "Foto"} className="aspect-square w-full bg-muro object-cover" />
            </li>
          ))}
        </ul>
      </section>
      {r.rounds.length > 1 && (
        <section>
          <h3 className="mb-3 font-display text-xl">Historial</h3>
          <ul className="space-y-2 text-sm">
            {[...r.rounds].reverse().map((round) => (
              <li key={round.round} className="text-grafito">
                Ronda {round.round}: pediste {formatMXN(Number(round.seller_price_cents))}
                {round.offered_price_cents ? `; propusimos ${formatMXN(Number(round.offered_price_cents))}` : ""}
                {round.seller_accepted_at ? "; aceptaste." : "."}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
