import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import type { RequestDetail } from "@/lib/consignment/service";
import { availableSlots, describeSlot, formatLongDate, INTAKE_METHOD_LABEL } from "@/lib/domain/inventory";
import { formatMXN } from "@/lib/domain/money";
import { getIntakeOptions, getSellerInventoryView } from "@/lib/inventory/service";
import { ContractForm, DeliveryForm, TrackingForm } from "@/components/inventory/seller-forms";
import { LegalText } from "@/components/inventory/legal-text";
import { ConfirmButton } from "@/components/consignment/seller-actions";
import { acceptContractAction, declineContractAction, scheduleIntakeAction, trackingAction } from "../inventory-actions";

/** Lo que sigue después de aceptar la oferta: entrega, recepción, contrato y publicación. */
export async function InventorySection({ r, notice }: { r: RequestDetail; notice?: string }) {
  const [user, view, options] = await Promise.all([requireUser(`/cuenta/consignaciones/${r.id}`), getSellerInventoryView(r.id), getIntakeOptions()]);
  const { plan, agreement, lastAuth } = view;

  return (
    <div className="space-y-8">
      {r.status === "pendiente_de_entrega" && (
        <section className="border border-tinta bg-white px-6 py-7">
          <h3 className="font-display text-2xl">Entrega de la pieza</h3>
          {plan && plan.status === "agendada" ? (
            <div className="mt-4 space-y-5">
              <dl className="space-y-2 text-sm">
                <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-linea pb-2">
                  <dt className="text-piedra">Forma</dt>
                  <dd>{INTAKE_METHOD_LABEL[plan.method]}</dd>
                </div>
                {plan.scheduled_for && (
                  <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-linea pb-2">
                    <dt className="text-piedra">Cuándo</dt>
                    <dd>{describeSlot(options, plan.method, new Date(plan.scheduled_for))}</dd>
                  </div>
                )}
                <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-linea pb-2">
                  <dt className="text-piedra">Dónde</dt>
                  <dd>
                    {plan.method === "recoleccion" && plan.address
                      ? `${plan.address.street}, ${plan.address.neighborhood}, ${plan.address.municipality}, C.P. ${plan.address.postalCode}`
                      : plan.method === "sucursal"
                        ? options.sucursal.address
                        : options.paqueteria.address}
                  </dd>
                </div>
                <div className="grid grid-cols-[9rem_1fr] gap-3">
                  <dt className="text-piedra">Tu código</dt>
                  <dd className="font-medium tracking-wider">{r.possession_code}</dd>
                </div>
              </dl>
              {plan.method === "paqueteria" && (
                <div className="border-t border-linea pt-5">
                  <p className="mb-3 text-sm">{plan.tracking_number ? `Guía registrada: ${plan.carrier} ${plan.tracking_number}.` : "Cuando la envíes, registra la guía:"}</p>
                  <TrackingForm action={trackingAction.bind(null, r.id)} carrier={plan.carrier ?? ""} tracking={plan.tracking_number ?? ""} />
                </div>
              )}
              <details className="border-t border-linea pt-5">
                <summary className="cursor-pointer text-sm underline underline-offset-4">Cambiar la entrega</summary>
                <div className="mt-5">
                  <Delivery r={r} options={options} user={user} submitLabel="Guardar el cambio" />
                </div>
              </details>
            </div>
          ) : (
            <div className="mt-4">
              <p className="mb-6 max-w-[64ch] text-sm text-grafito">
                Elige cómo nos haces llegar la pieza. Al recibirla la autenticamos en persona y te mandamos tu contrato.
              </p>
              <Delivery r={r} options={options} user={user} submitLabel="Agendar entrega" />
            </div>
          )}
        </section>
      )}

      {(r.status === "recibida" || r.status === "en_autenticacion") && (
        <p className="border-l-2 border-tinta bg-white px-5 py-4 text-sm">
          Recibimos tu pieza{view.receivedAt ? ` el ${formatLongDate(new Date(view.receivedAt))}` : ""}
          {view.sku ? ` (número ${view.sku})` : ""}. La estamos autenticando en persona; te avisamos por correo.
        </p>
      )}

      {r.status === "pendiente_de_contrato" && agreement && (
        <section className="border border-tinta bg-white px-6 py-7">
          <h3 className="font-display text-2xl">Tu contrato de consignación</h3>
          <p className="mt-2 text-sm text-grafito">Tu pieza pasó la autenticación física. Revisa las condiciones y acéptalas para publicarla.</p>
          <dl className="mt-6 space-y-2 text-sm">
            {[
              ["Precio de publicación", formatMXN(agreement.breakdown.salePriceCents)],
              [`Comisión (${agreement.commission_rate_bps / 100} %)`, formatMXN(agreement.breakdown.commissionCents)],
              ["Recibes al venderse", formatMXN(agreement.breakdown.sellerGrossCents)],
              ["Recibida el", agreement.received_at ? formatLongDate(new Date(agreement.received_at)) : "—"],
              ["Permanencia mínima", agreement.hold_until ? `${agreement.min_hold_days} días, hasta el ${formatLongDate(new Date(agreement.hold_until))}` : `${agreement.min_hold_days} días`],
              ["Después", "Tú decides: la retiras o sigue publicada sin vencimiento"],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[11rem_1fr] gap-3 border-b border-linea pb-2">
                <dt className="text-piedra">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <details className="mt-6 border-y border-linea py-4" open>
            <summary className="cursor-pointer text-sm font-medium">
              {agreement.title} (versión {agreement.version})
            </summary>
            <div className="mt-4 max-h-96 overflow-y-auto pr-2">
              <LegalText body={agreement.body_md} />
            </div>
          </details>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <ContractForm action={acceptContractAction.bind(null, r.id)} />
            <ConfirmButton action={declineContractAction.bind(null, r.id)} label="No acepto, devuélvanmela" confirm="¿Seguro? Te devolveremos la pieza." />
          </div>
        </section>
      )}

      {r.status === "pendiente_de_fotografia" && notice !== "contrato" && (
        <p className="border-l-2 border-tinta bg-white px-5 py-4 text-sm">
          Aceptaste tu contrato{agreement?.accepted_at ? ` el ${formatLongDate(new Date(agreement.accepted_at))}` : ""}. Estamos fotografiando tu pieza para publicarla.
        </p>
      )}

      {r.status === "publicada" && (
        <section className="border border-linea bg-white px-6 py-6 text-sm">
          <p>
            Tu pieza está a la venta en {agreement ? formatMXN(agreement.breakdown.salePriceCents) : "el catálogo"}
            {agreement?.hold_until ? `. Puedes pedir su retiro a partir del ${formatLongDate(new Date(agreement.hold_until))}.` : "."}
          </p>
          {view.slug && (
            <Link href={`/producto/${view.slug}`} className="mt-3 inline-block underline underline-offset-4">
              Ver la publicación
            </Link>
          )}
        </section>
      )}

      {(r.status === "devolucion_pendiente" || r.status === "autenticacion_fallida") && (
        <section className="border-l-2 border-tinta bg-white px-5 py-4 text-sm">
          {lastAuth?.result === "no_autentica" ? (
            <>
              <p className="font-medium">La pieza no pasó la autenticación física</p>
              {lastAuth.seller_message && <p className="mt-1 whitespace-pre-line text-grafito">{lastAuth.seller_message}</p>}
            </>
          ) : (
            <p className="font-medium">Vamos a devolverte la pieza</p>
          )}
          <p className="mt-2 text-grafito">Te contactamos para coordinar la devolución.</p>
        </section>
      )}
    </div>
  );
}

function Delivery({
  r,
  options,
  user,
  submitLabel,
}: {
  r: RequestDetail;
  options: Awaited<ReturnType<typeof getIntakeOptions>>;
  user: { fullName: string | null; phone: string | null };
  submitLabel: string;
}) {
  const now = new Date();
  return (
    <DeliveryForm
      action={scheduleIntakeAction.bind(null, r.id)}
      methods={{ sucursal: options.sucursal.enabled, recoleccion: options.recoleccion.enabled, paqueteria: options.paqueteria.enabled }}
      sucursal={{ address: options.sucursal.address, slots: availableSlots(options, "sucursal", now) }}
      recoleccion={{
        fee: options.recoleccion.fee_cents > 0 ? formatMXN(options.recoleccion.fee_cents) : null,
        municipalities: options.recoleccion.municipalities,
        slots: availableSlots(options, "recoleccion", now),
      }}
      paqueteria={{ address: options.paqueteria.address, notes: options.paqueteria.notes }}
      defaults={{ recipient: user.fullName ?? "", phone: user.phone ?? "" }}
      submitLabel={submitLabel}
    />
  );
}
