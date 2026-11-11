import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hasRole, requireRole, STAFF_ROLES, type CurrentUser } from "@/lib/auth/session";
import { isUuid } from "@/lib/consignment/service";
import { sellerStatus } from "@/lib/consignment/labels";
import { INCLUDED_ITEMS } from "@/lib/consignment/schemas";
import { checklistFor, describeSlot, formatLongDate, INTAKE_METHOD_LABEL, INTAKE_METHODS } from "@/lib/domain/inventory";
import { DECLARED_CONDITION_LABEL, formatDate, formatScore, INCLUDED_ITEM_LABEL } from "@/lib/domain/labels";
import { formatMXN } from "@/lib/domain/money";
import { POSSESSION_SLOT } from "@/lib/domain/photo-guide";
import { getIntakeOptions, getPieceForStaff, type PieceForStaff } from "@/lib/inventory/service";
import { AUTHENTICATORS, OPERATIONS, PHOTOGRAPHERS } from "@/lib/inventory/roles";
import { InventoryPhotos } from "@/components/inventory/inventory-photos";
import { AuthenticationForm, IntakeForm, PublishForm, ReturnForm } from "@/components/inventory/staff-forms";
import { authenticationAction, intakeAction, publishAction, returnAction } from "../actions";

export const metadata: Metadata = { title: "Pieza en inventario" };
export const dynamic = "force-dynamic";

const NOTICES: Record<string, string> = {
  recibida: "Recepción registrada y SKU asignado. Avisamos al vendedor.",
  autentica: "Autenticación aprobada. Le mandamos el contrato al vendedor.",
  no_autentica: "Autenticación fallida. Avisamos al vendedor y la pieza quedó en devoluciones.",
  no_concluyente: "Guardamos la revisión como no concluyente. La pieza sigue en autenticación.",
  publicada: "La pieza ya está publicada en el catálogo. Avisamos al vendedor.",
  devuelta: "Registramos la devolución.",
};

const ANSWER_LABEL = { ok: "Bien", falla: "Falla", na: "No aplica" } as const;
const RESULT_LABEL = { autentica: "Auténtica", no_autentica: "No auténtica", no_concluyente: "No concluyente" } as const;

export default async function InventoryPiecePage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const me = await requireRole(STAFF_ROLES, `/admin/inventario/${params.id}`);
  if (!isUuid(params.id)) notFound();
  const [p, options] = await Promise.all([getPieceForStaff(params.id), getIntakeOptions()]);
  if (!p) notFound();

  const notice = searchParams.aviso ? NOTICES[searchParams.aviso] : undefined;
  const can = (roles: readonly string[]) => roles.some((r) => hasRole(me, r as never));

  return (
    <div className="space-y-10">
      <div>
        <Link href="/admin/inventario" className="text-sm text-grafito underline underline-offset-4">
          Inventario
        </Link>
        <h2 className="mt-3 font-display text-2xl">
          {p.brand_name} <span className="text-grafito">{p.model}</span>
          {p.sku && <span className="ml-3 align-middle font-sans text-sm text-piedra">{p.sku}</span>}
        </h2>
        <p className="mt-1 text-sm text-grafito">
          {sellerStatus(p.status).label}. De {p.seller_name ?? "sin nombre"} ({p.seller_email}
          {p.seller_phone ? `, ${p.seller_phone}` : ""}).{" "}
          <Link href={`/admin/solicitudes/${p.id}`} className="underline underline-offset-4">
            Ver solicitud
          </Link>
        </p>
      </div>

      {notice && <p role="status" className="border-l-2 border-tinta bg-white px-4 py-3 text-sm">{notice}</p>}

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-10">
          <StagePanel p={p} me={me} can={can} />
        </div>
        <aside className="space-y-8 text-sm">
          <Summary p={p} options={options} />
          <History p={p} />
        </aside>
      </div>
    </div>
  );
}

function StagePanel({ p, me, can }: { p: PieceForStaff; me: CurrentUser; can: (r: readonly string[]) => boolean }) {
  const photos = (kind: string) => p.images.filter((i) => i.kind === kind).map((i) => ({ id: i.id, url: i.url }));
  const noRole = (who: string) => <p className="text-sm text-grafito">Este paso lo hace {who}.</p>;

  switch (p.status) {
    case "pendiente_de_entrega":
      return (
        <section className="space-y-6">
          <h3 className="font-display text-xl">Recepción</h3>
          <InventoryPhotos
            productId={p.id}
            userId={me.id}
            kind="recepcion"
            label="Cómo llegó"
            hint="Empaque y pieza al abrirla, con todo lo que trae. Al menos una foto."
            photos={photos("recepcion")}
            editable={can(PHOTOGRAPHERS)}
          />
          {can(OPERATIONS) ? (
            <IntakeForm
              action={intakeAction.bind(null, p.id)}
              defaultMethod={p.plan?.method ?? "sucursal"}
              methods={INTAKE_METHODS.map((m) => ({ value: m, label: INTAKE_METHOD_LABEL[m] }))}
              items={INCLUDED_ITEMS.map((i) => ({ value: i, label: INCLUDED_ITEM_LABEL[i] }))}
              declared={p.includes}
            />
          ) : (
            noRole("operaciones")
          )}
        </section>
      );

    case "recibida":
    case "en_autenticacion": {
      const possession = p.images.find((i) => i.slot === POSSESSION_SLOT);
      return (
        <section className="space-y-6">
          <h3 className="font-display text-xl">Autenticación física</h3>
          <div>
            <p className="mb-2 text-sm text-grafito">Fotos de la solicitud, para comparar con la pieza:</p>
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {[...p.images.filter((i) => i.kind === "preliminar"), ...(possession ? [possession] : [])].map((i) => (
                <li key={i.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.url} alt={i.slot ?? ""} className="aspect-square w-full bg-muro object-cover" />
                </li>
              ))}
            </ul>
          </div>
          <InventoryPhotos
            productId={p.id}
            userId={me.id}
            kind="defecto"
            label="Evidencia y defectos"
            hint="Detalles revisados y cualquier defecto. Los defectos se muestran en la publicación."
            photos={photos("defecto")}
            editable={can(PHOTOGRAPHERS)}
          />
          {can(AUTHENTICATORS) ? <AuthenticationForm action={authenticationAction.bind(null, p.id)} items={checklistFor(p.category_slug)} /> : noRole("un autenticador")}
        </section>
      );
    }

    case "pendiente_de_contrato":
      return (
        <section className="space-y-6">
          <h3 className="font-display text-xl">Esperando contrato</h3>
          <p className="text-sm text-grafito">El vendedor tiene que aceptar su contrato desde su cuenta. Mientras, puedes adelantar las fotos finales.</p>
          <InventoryPhotos
            productId={p.id}
            userId={me.id}
            kind="final"
            label="Fotos finales"
            hint="Fondo liso, luz pareja. La primera es la portada."
            photos={photos("final")}
            editable={can(PHOTOGRAPHERS)}
          />
        </section>
      );

    case "pendiente_de_fotografia":
      return (
        <section className="space-y-6">
          <h3 className="font-display text-xl">Fotografía y publicación</h3>
          <InventoryPhotos
            productId={p.id}
            userId={me.id}
            kind="final"
            label="Fotos finales"
            hint="Fondo liso, luz pareja. La primera es la portada. Recomendado: 5 o más."
            photos={photos("final")}
            editable={can(PHOTOGRAPHERS)}
          />
          {can(OPERATIONS) ? (
            <PublishForm action={publishAction.bind(null, p.id)} description={p.description ?? ""} ready={photos("final").length > 0} />
          ) : (
            noRole("operaciones")
          )}
        </section>
      );

    case "devolucion_pendiente":
      return (
        <section className="space-y-6">
          <h3 className="font-display text-xl">Devolución</h3>
          <p className="text-sm text-grafito">
            {p.authentications[0]?.result === "no_autentica" ? "No pasó la autenticación." : "El vendedor no aceptó el contrato."} Coordina con{" "}
            {p.seller_name ?? "el vendedor"} ({p.seller_email}
            {p.seller_phone ? `, ${p.seller_phone}` : ""}) y registra cuando se la entregues.
          </p>
          {can(OPERATIONS) ? <ReturnForm action={returnAction.bind(null, p.id)} /> : noRole("operaciones")}
        </section>
      );

    case "publicada":
      return (
        <section className="space-y-4">
          <h3 className="font-display text-xl">Publicada</h3>
          {p.slug && (
            <Link href={`/producto/${p.slug}`} className="underline underline-offset-4">
              Ver la publicación
            </Link>
          )}
        </section>
      );

    default:
      return <p className="text-grafito">No hay nada pendiente en esta etapa.</p>;
  }
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 border-b border-linea pb-2">
      <dt className="text-piedra">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function Summary({ p, options }: { p: PieceForStaff; options: Awaited<ReturnType<typeof getIntakeOptions>> }) {
  const a = p.agreement;
  return (
    <>
      <dl className="space-y-2">
        <Row k="Categoría" v={p.category_name} />
        <Row k="Talla" v={p.size_label ? `${p.size_label}${p.size_system && p.size_system !== "UNICA" ? ` ${p.size_system}` : ""}` : "No aplica"} />
        <Row k="Condición declarada" v={DECLARED_CONDITION_LABEL[p.declared_condition]} />
        {p.final_condition_score && <Row k="Condición confirmada" v={`${formatScore(Number(p.final_condition_score))}/10`} />}
        <Row k="Precio aceptado" v={p.offered_price_cents ? formatMXN(Number(p.offered_price_cents)) : "—"} />
        <Row k="Incluye (declarado)" v={p.includes.length ? p.includes.map((i) => INCLUDED_ITEM_LABEL[i]).join(", ") : "Nada adicional"} />
      </dl>

      {p.plan && (
        <div>
          <h4 className="mb-2 font-medium">Entrega</h4>
          <dl className="space-y-2">
            <Row k="Forma" v={INTAKE_METHOD_LABEL[p.plan.method]} />
            {p.plan.scheduled_for && <Row k="Cuándo" v={describeSlot(options, p.plan.method, new Date(p.plan.scheduled_for))} />}
            {p.plan.address && (
              <Row
                k="Dirección"
                v={`${p.plan.address.street}, ${p.plan.address.neighborhood}, ${p.plan.address.municipality}, C.P. ${p.plan.address.postalCode}. ${p.plan.address.recipient}, ${p.plan.address.phone}${p.plan.address.references ? `. ${p.plan.address.references}` : ""}`}
              />
            )}
            {p.plan.method === "paqueteria" && <Row k="Guía" v={p.plan.tracking_number ? `${p.plan.carrier} ${p.plan.tracking_number}` : "Sin registrar"} />}
          </dl>
        </div>
      )}

      {p.intake && (
        <div>
          <h4 className="mb-2 font-medium">Recepción</h4>
          <dl className="space-y-2">
            <Row k="Recibida" v={`${formatLongDate(new Date(p.intake.received_at))}, por ${p.intake.received_by_name ?? "equipo"}`} />
            <Row k="Llegó" v={INTAKE_METHOD_LABEL[p.intake.method]} />
            <Row k="Con" v={p.intake.accessories_received.length ? p.intake.accessories_received.map((i) => INCLUDED_ITEM_LABEL[i]).join(", ") : "Solo la pieza"} />
            {p.intake.notes && <Row k="Notas" v={p.intake.notes} />}
          </dl>
        </div>
      )}

      {p.authentications.length > 0 && (
        <div>
          <h4 className="mb-2 font-medium">Autenticaciones</h4>
          <ul className="space-y-3">
            {p.authentications.map((a, i) => (
              <li key={i} className="border-b border-linea pb-3">
                <p>
                  <span className="font-medium">{RESULT_LABEL[a.result]}</span>, {formatDate(a.created_at)} por {a.authenticator_name ?? "equipo"}
                </p>
                <p className="mt-1 text-xs text-piedra">
                  {Object.entries(a.checklist)
                    .filter(([, v]) => v === "falla")
                    .map(([k]) => k.replace(/_/g, " "))
                    .join(", ") || `Sin fallas (${Object.values(a.checklist).filter((v) => v === "ok").length} puntos bien)`}
                </p>
                {a.notes && <p className="mt-1 text-grafito">{a.notes}</p>}
                {a.seller_message && <p className="mt-1 text-grafito">Al vendedor: {a.seller_message}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-piedra">Respuestas: {Object.values(ANSWER_LABEL).join(" / ")}</p>
        </div>
      )}

      {a && (
        <div>
          <h4 className="mb-2 font-medium">Contrato</h4>
          <dl className="space-y-2">
            <Row k="Precio" v={formatMXN(a.breakdown.salePriceCents)} />
            <Row k="Comisión" v={`${a.commission_rate_bps / 100} % (${formatMXN(a.breakdown.commissionCents)})`} />
            <Row k="Al vendedor" v={formatMXN(a.breakdown.sellerGrossCents)} />
            <Row k="Permanencia" v={a.hold_until ? `Hasta el ${formatLongDate(new Date(a.hold_until))}` : `${a.min_hold_days} días`} />
            <Row k="Aceptado" v={a.accepted_at ? formatDate(a.accepted_at) : "Pendiente"} />
          </dl>
        </div>
      )}
    </>
  );
}

function History({ p }: { p: PieceForStaff }) {
  if (!p.history.length) return null;
  return (
    <div>
      <h4 className="mb-2 font-medium">Historial</h4>
      <ul className="space-y-1.5 text-xs text-grafito">
        {p.history.map((h, i) => (
          <li key={i}>
            {formatDate(h.created_at)}: {sellerStatus(h.to_status).label}
            {h.changed_by_name ? `, ${h.changed_by_name}` : ""}
            {h.reason ? ` (${h.reason})` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
