import "server-only";
import type { PoolClient } from "pg";
import { query, transaction } from "@/lib/db";
import { audit } from "@/lib/auth/service";
import { activeRules } from "@/lib/consignment/service";
import { computeCommission, findRule, type CommissionBreakdown } from "@/lib/domain/commissions";
import {
  checklistFor,
  checklistProblem,
  formatSku,
  isAvailableSlot,
  normalizeIntakeOptions,
  pickupCovers,
  productSlug,
  type AuthResult,
  type CheckAnswer,
  type IntakeMethod,
  type IntakeOptions,
} from "@/lib/domain/inventory";
import { assertTransition, PRODUCT_TRANSITIONS, type ProductStatus } from "@/lib/domain/state-machines";
import { isOwnedPhotoUrl } from "@/lib/storage";

/**
 * Fase 3B: de la oferta aceptada a la pieza publicada.
 * Toda regla que importa también la valida la base (transiciones, regla de publicación, una entrega vigente).
 */

export class InventoryError extends Error {}

const INVENTORY_PREFIX = (productId: string) => `inventario/${productId}/`;
export const inventoryPhotoPrefix = INVENTORY_PREFIX;

async function setStatus(c: PoolClient, productId: string, from: ProductStatus, to: ProductStatus, reason?: string) {
  assertTransition("pieza", PRODUCT_TRANSITIONS, from, to);
  if (reason) await c.query("select set_config('app.status_reason', $1, true)", [reason]);
  await c.query("update products set status = $2 where id = $1", [productId, to]);
  if (reason) await c.query("select set_config('app.status_reason', '', true)");
}

async function lockProduct(c: PoolClient, productId: string) {
  const { rows } = await c.query<{ id: string; status: ProductStatus; seller_id: string; category_slug: string; commission_group: string }>(
    `select p.id, p.status, p.seller_id, c.slug as category_slug, c.commission_group
     from products p join product_categories c on c.id = p.category_id
     where p.id = $1 for update of p`,
    [productId],
  );
  if (!rows[0]) throw new InventoryError("No encontramos la pieza");
  return rows[0];
}

// ---------------------------------------------------------------------
// Opciones de entrega
// ---------------------------------------------------------------------

export async function getIntakeOptions(): Promise<IntakeOptions> {
  const rows = await query<{ value: unknown }>("select value from platform_settings where key = 'public.intake_options'");
  return normalizeIntakeOptions(rows[0]?.value);
}

export async function minHoldDays(): Promise<number> {
  const rows = await query<{ value: unknown }>("select value from platform_settings where key = 'public.consignment_min_hold_days'");
  const n = Number(rows[0]?.value);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

// ---------------------------------------------------------------------
// Vendedor: agenda la entrega
// ---------------------------------------------------------------------

export interface PickupAddress {
  recipient: string;
  phone: string;
  street: string;
  neighborhood: string;
  municipality: string;
  postalCode: string;
  references: string | null;
}

export type IntakeInput =
  | { method: "sucursal"; scheduledFor: string }
  | { method: "recoleccion"; scheduledFor: string; address: PickupAddress }
  | { method: "paqueteria" };

export interface IntakePlan {
  id: string;
  method: IntakeMethod;
  scheduled_for: Date | null;
  address: PickupAddress | null;
  carrier: string | null;
  tracking_number: string | null;
  status: "agendada" | "recibida" | "cancelada";
  created_at: Date;
}

export async function scheduleIntake(userId: string, productId: string, input: IntakeInput, now = new Date()): Promise<IntakePlan> {
  const options = await getIntakeOptions();
  if (!options[input.method].enabled) throw new InventoryError("Esa forma de entrega no está disponible por ahora");
  if (input.method !== "paqueteria" && !isAvailableSlot(options, input.method, input.scheduledFor, now)) {
    throw new InventoryError("Ese horario ya no está disponible; elige otro");
  }
  if (input.method === "recoleccion" && !pickupCovers(options, input.address.postalCode)) {
    throw new InventoryError("Por ahora solo recolectamos en Guadalajara y su zona metropolitana. Elige punto fijo o paquetería.");
  }

  return transaction(async (c) => {
    const p = await lockProduct(c, productId);
    if (p.seller_id !== userId) throw new InventoryError("No encontramos esta solicitud");
    if (p.status !== "pendiente_de_entrega") throw new InventoryError("Esta pieza ya no está pendiente de entrega");
    await c.query("update intake_plans set status = 'cancelada' where product_id = $1 and status = 'agendada'", [productId]);
    const { rows } = await c.query<IntakePlan>(
      `insert into intake_plans (product_id, method, scheduled_for, address, created_by)
       values ($1, $2, $3, $4, $5)
       returning id, method, scheduled_for, address, carrier, tracking_number, status, created_at`,
      [
        productId,
        input.method,
        input.method === "paqueteria" ? null : input.scheduledFor,
        input.method === "recoleccion" ? JSON.stringify(input.address) : null,
        userId,
      ],
    );
    await audit(userId, "entrega_agendada", "products", productId, { metodo: input.method }, c);
    return rows[0];
  }, userId);
}

export async function setTracking(userId: string, productId: string, carrier: string, tracking: string): Promise<void> {
  await transaction(async (c) => {
    const p = await lockProduct(c, productId);
    if (p.seller_id !== userId) throw new InventoryError("No encontramos esta solicitud");
    const { rowCount } = await c.query(
      `update intake_plans set carrier = $2, tracking_number = $3
       where product_id = $1 and status = 'agendada' and method = 'paqueteria'`,
      [productId, carrier, tracking],
    );
    if (!rowCount) throw new InventoryError("Primero elige envío por paquetería");
    await audit(userId, "guia_registrada", "products", productId, { paqueteria: carrier }, c);
  }, userId);
}

export async function getActivePlan(productId: string): Promise<IntakePlan | null> {
  const rows = await query<IntakePlan>(
    `select id, method::text as method, scheduled_for, address, carrier, tracking_number, status, created_at
     from intake_plans where product_id = $1 and status <> 'cancelada' order by created_at desc limit 1`,
    [productId],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------
// Fotos del equipo (recepción, evidencia y finales)
// ---------------------------------------------------------------------

export type InventoryPhotoKind = "recepcion" | "defecto" | "final";

const PHOTO_STAGES: Record<InventoryPhotoKind, ProductStatus[]> = {
  recepcion: ["pendiente_de_entrega", "recibida", "en_autenticacion"],
  defecto: ["recibida", "en_autenticacion", "pendiente_de_contrato", "pendiente_de_fotografia"],
  final: ["pendiente_de_contrato", "pendiente_de_fotografia"],
};

export async function canStaffUpload(productId: string): Promise<boolean> {
  const rows = await query<{ status: ProductStatus }>("select status from products where id = $1", [productId]);
  if (!rows[0]) return false;
  return Object.values(PHOTO_STAGES).some((s) => s.includes(rows[0].status));
}

export async function addInventoryPhoto(staffId: string, productId: string, kind: InventoryPhotoKind, url: string, pathname: string): Promise<{ id: string }> {
  if (!isOwnedPhotoUrl(url, pathname, INVENTORY_PREFIX(productId))) throw new InventoryError("Foto inválida");
  return transaction(async (c) => {
    const p = await lockProduct(c, productId);
    if (!PHOTO_STAGES[kind].includes(p.status)) throw new InventoryError("En esta etapa no se agregan fotos de este tipo");
    const { rows } = await c.query<{ id: string }>(
      `insert into product_images (product_id, kind, url, pathname, sort_order, created_by)
       values ($1, $2, $3, $4, coalesce((select max(sort_order) + 1 from product_images where product_id = $1 and kind = $2), 0), $5)
       returning id`,
      [productId, kind, url, pathname, staffId],
    );
    return rows[0];
  }, staffId);
}

export async function removeInventoryPhoto(staffId: string, productId: string, imageId: string): Promise<{ url: string } | null> {
  return transaction(async (c) => {
    const p = await lockProduct(c, productId);
    const { rows } = await c.query<{ url: string; kind: InventoryPhotoKind }>(
      "select url, kind from product_images where id = $1 and product_id = $2 and kind in ('recepcion', 'defecto', 'final')",
      [imageId, productId],
    );
    if (!rows[0]) return null;
    if (!PHOTO_STAGES[rows[0].kind].includes(p.status)) throw new InventoryError("Esta foto ya no se puede quitar");
    await c.query("delete from product_images where id = $1", [imageId]);
    await audit(staffId, "foto_inventario_quitada", "products", productId, { tipo: rows[0].kind }, c);
    return { url: rows[0].url };
  }, staffId);
}

// ---------------------------------------------------------------------
// Equipo: recepción
// ---------------------------------------------------------------------

export interface IntakeRecordInput {
  method: IntakeMethod;
  accessories: string[];
  notes: string | null;
}

export async function registerIntake(staffId: string, productId: string, input: IntakeRecordInput, now = new Date()): Promise<{ sku: string }> {
  return transaction(async (c) => {
    const p = await lockProduct(c, productId);
    if (p.status !== "pendiente_de_entrega") throw new InventoryError("Esta pieza no está pendiente de entrega");
    const { rows: photos } = await c.query<{ n: string }>("select count(*) as n from product_images where product_id = $1 and kind = 'recepcion'", [productId]);
    if (Number(photos[0].n) < 1) throw new InventoryError("Sube al menos una foto de cómo llegó la pieza");

    const { rows: seq } = await c.query<{ n: string }>("select nextval('product_sku_seq') as n");
    const sku = formatSku(Number(seq[0].n), now);
    await c.query("update products set sku = $2, received_at = $3 where id = $1", [productId, sku, now]);
    await setStatus(c, productId, p.status, "recibida");
    await c.query(
      `insert into intake_records (product_id, method, received_by, received_at, accessories_received, notes)
       values ($1, $2, $3, $4, $5::included_item[], $6)`,
      [productId, input.method, staffId, now, input.accessories, input.notes],
    );
    await c.query("update intake_plans set status = 'recibida' where product_id = $1 and status = 'agendada'", [productId]);
    await audit(staffId, "pieza_recibida", "products", productId, { sku, metodo: input.method }, c);
    return { sku };
  }, staffId);
}

// ---------------------------------------------------------------------
// Equipo: autenticación física
// ---------------------------------------------------------------------

export interface AuthenticationInput {
  answers: Record<string, CheckAnswer>;
  result: AuthResult;
  conditionScore: number | null;
  notes: string | null;
  sellerMessage: string | null;
}

export async function recordAuthentication(staffId: string, productId: string, input: AuthenticationInput): Promise<{ status: ProductStatus }> {
  return transaction(async (c) => {
    const p = await lockProduct(c, productId);
    if (p.status !== "recibida" && p.status !== "en_autenticacion") throw new InventoryError("Esta pieza no está lista para autenticar");

    const problem = checklistProblem(checklistFor(p.category_slug), input.answers, input.result);
    if (problem) throw new InventoryError(problem);
    if (input.result === "autentica" && input.conditionScore === null) throw new InventoryError("Califica la condición de la pieza");
    if (input.result === "no_autentica" && !input.sellerMessage) throw new InventoryError("Escribe el mensaje para el vendedor");

    if (p.status === "recibida") await setStatus(c, productId, "recibida", "en_autenticacion");

    await c.query(
      `insert into authentication_records (product_id, authenticator_id, checklist, result, notes, seller_message)
       values ($1, $2, $3, $4, $5, $6)`,
      [productId, staffId, JSON.stringify(input.answers), input.result, input.notes, input.result === "no_autentica" ? input.sellerMessage : null],
    );

    if (input.result === "no_concluyente") {
      await audit(staffId, "autenticacion_no_concluyente", "products", productId, undefined, c);
      return { status: "en_autenticacion" as ProductStatus };
    }

    if (input.result === "no_autentica") {
      await setStatus(c, productId, "en_autenticacion", "autenticacion_fallida", "No pasó la autenticación física");
      await setStatus(c, productId, "autenticacion_fallida", "devolucion_pendiente", "Devolución por autenticación fallida");
      await audit(staffId, "autenticacion_fallida", "products", productId, undefined, c);
      return { status: "devolucion_pendiente" as ProductStatus };
    }

    const score = Math.round((input.conditionScore as number) * 2) / 2;
    await c.query(
      `insert into condition_assessments (product_id, source, score, summary, created_by)
       values ($1, 'humana', $2, $3, $4)`,
      [productId, score, input.notes, staffId],
    );
    await c.query("update products set final_condition_score = $2 where id = $1", [productId, score]);
    await createAgreement(c, productId, p.commission_group);
    await setStatus(c, productId, "en_autenticacion", "pendiente_de_contrato");
    await audit(staffId, "autenticacion_aprobada", "products", productId, { condicion: score }, c);
    return { status: "pendiente_de_contrato" as ProductStatus };
  }, staffId);
}

/** Contrato con el precio aceptado por el vendedor y la comisión vigente, congelados. */
async function createAgreement(c: PoolClient, productId: string, group: string): Promise<void> {
  const { rows: offer } = await c.query<{ offered_price_cents: string }>(
    `select offered_price_cents from consignment_requests
     where product_id = $1 and seller_accepted_at is not null order by round desc limit 1`,
    [productId],
  );
  if (!offer[0]) throw new InventoryError("La pieza no tiene una oferta aceptada por el vendedor");
  const price = Number(offer[0].offered_price_cents);
  const rule = findRule(await activeRules(group), group, price);
  const { rows: doc } = await c.query<{ id: string }>(
    `select id from legal_documents where kind = 'contrato_consignacion' and published_at is not null order by version desc limit 1`,
  );
  if (!doc[0]) throw new InventoryError("No hay un contrato de consignación publicado");
  const { rows: hold } = await c.query<{ value: unknown }>("select value from platform_settings where key = 'public.consignment_min_hold_days'");
  const holdDays = Number(hold[0]?.value ?? 30);

  await c.query("update consignment_agreements set superseded_at = now() where product_id = $1 and superseded_at is null", [productId]);
  await c.query(
    `insert into consignment_agreements
       (product_id, legal_document_id, agreed_price_cents, commission_rule_id, commission_rate_bps, commission_min_fee_cents, duration_days, min_hold_days)
     values ($1, $2, $3, $4, $5, $6, null, $7)`,
    [productId, doc[0].id, price, rule.id, rule.rateBps, rule.minFeeCents, Number.isFinite(holdDays) ? holdDays : 30],
  );
}

// ---------------------------------------------------------------------
// Vendedor: contrato
// ---------------------------------------------------------------------

export interface AgreementView {
  id: string;
  agreed_price_cents: string;
  commission_rate_bps: number;
  commission_min_fee_cents: string;
  min_hold_days: number;
  accepted_at: Date | null;
  received_at: Date | null;
  hold_until: Date | null;
  title: string;
  version: number;
  body_md: string;
  breakdown: CommissionBreakdown;
}

export async function getAgreement(productId: string): Promise<AgreementView | null> {
  const rows = await query<Omit<AgreementView, "breakdown">>(
    `select a.id, a.agreed_price_cents, a.commission_rate_bps, a.commission_min_fee_cents, a.min_hold_days, a.accepted_at,
            p.received_at, p.received_at + make_interval(days => a.min_hold_days) as hold_until,
            d.title, d.version, d.body_md
     from consignment_agreements a
     join products p on p.id = a.product_id
     join legal_documents d on d.id = a.legal_document_id
     where a.product_id = $1 and a.superseded_at is null`,
    [productId],
  );
  const a = rows[0];
  if (!a) return null;
  const breakdown = computeCommission(Number(a.agreed_price_cents), {
    id: "contrato",
    rateBps: a.commission_rate_bps,
    minFeeCents: Number(a.commission_min_fee_cents),
  });
  return { ...a, breakdown };
}

export async function acceptAgreement(userId: string, productId: string, ip: string | null, userAgent: string | null): Promise<void> {
  await transaction(async (c) => {
    const p = await lockProduct(c, productId);
    if (p.seller_id !== userId) throw new InventoryError("No encontramos esta solicitud");
    if (p.status !== "pendiente_de_contrato") throw new InventoryError("Este contrato ya no está pendiente");
    const { rowCount } = await c.query(
      `update consignment_agreements set accepted_at = now(), accepted_ip = $2::inet, accepted_user_agent = $3
       where product_id = $1 and superseded_at is null and accepted_at is null`,
      [productId, ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null, userAgent?.slice(0, 400) ?? null],
    );
    if (!rowCount) throw new InventoryError("No hay un contrato pendiente de aceptar");
    await setStatus(c, productId, p.status, "pendiente_de_fotografia");
    await audit(userId, "contrato_aceptado", "products", productId, undefined, c);
  }, userId);
}

export async function declineAgreement(userId: string, productId: string): Promise<void> {
  await transaction(async (c) => {
    const p = await lockProduct(c, productId);
    if (p.seller_id !== userId) throw new InventoryError("No encontramos esta solicitud");
    if (p.status !== "pendiente_de_contrato") throw new InventoryError("Este contrato ya no está pendiente");
    await c.query("update consignment_agreements set superseded_at = now() where product_id = $1 and superseded_at is null", [productId]);
    await setStatus(c, productId, p.status, "devolucion_pendiente", "El vendedor no aceptó el contrato");
    await audit(userId, "contrato_rechazado", "products", productId, undefined, c);
  }, userId);
}

// ---------------------------------------------------------------------
// Equipo: publicación y devoluciones
// ---------------------------------------------------------------------

export async function publishPiece(staffId: string, productId: string, description: string | null): Promise<{ slug: string }> {
  return transaction(async (c) => {
    const p = await lockProduct(c, productId);
    if (p.status !== "pendiente_de_fotografia") throw new InventoryError("La pieza no está lista para publicarse");
    const { rows } = await c.query<{ sku: string; model: string; brand: string; price: string | null }>(
      `select p.sku, p.model, b.name as brand,
              (select agreed_price_cents from consignment_agreements a
               where a.product_id = p.id and a.superseded_at is null and a.accepted_at is not null) as price
       from products p join brands b on b.id = p.brand_id where p.id = $1`,
      [productId],
    );
    const r = rows[0];
    if (!r.price) throw new InventoryError("Falta el contrato aceptado");
    if (!r.sku) throw new InventoryError("La pieza no tiene SKU");
    const slug = productSlug(r.brand, r.model, r.sku);
    await c.query("update products set listed_price_cents = $2, slug = $3, description = coalesce($4, description) where id = $1", [productId, r.price, slug, description]);
    try {
      await setStatus(c, productId, p.status, "publicada");
    } catch (e) {
      // La base valida la regla de oro (autenticación, contrato, fotos finales, condición) y explica qué falta.
      const msg = (e as Error).message;
      if (msg.startsWith("No se puede publicar")) throw new InventoryError(msg);
      throw e;
    }
    await audit(staffId, "pieza_publicada", "products", productId, { slug }, c);
    return { slug };
  }, staffId);
}

/** La empresa saca una pieza publicada del catálogo (daño, disputa, error, prueba). Queda pendiente de devolver. */
export async function unpublishPiece(staffId: string, productId: string, reason: string): Promise<void> {
  await transaction(async (c) => {
    const p = await lockProduct(c, productId);
    if (p.status !== "publicada") throw new InventoryError("Solo se puede retirar una pieza que está publicada");
    // La base exige un motivo de la empresa para devolver una pieza publicada sin solicitud del vendedor.
    await c.query("select set_config('app.return_reason', $1, true)", [reason]);
    await setStatus(c, productId, p.status, "devolucion_pendiente", `Retirada del catálogo por la empresa: ${reason}`);
    await c.query("select set_config('app.return_reason', '', true)");
    await audit(staffId, "pieza_retirada_del_catalogo", "products", productId, { motivo: reason }, c);
  }, staffId);
}

export async function markReturned(staffId: string, productId: string, notes: string | null): Promise<void> {
  await transaction(async (c) => {
    const p = await lockProduct(c, productId);
    if (p.status !== "devolucion_pendiente") throw new InventoryError("Esta pieza no tiene una devolución pendiente");
    await setStatus(c, productId, p.status, "devuelta_al_vendedor", notes ?? "Pieza devuelta al vendedor");
    await audit(staffId, "pieza_devuelta", "products", productId, notes ? { notas: notes } : undefined, c);
  }, staffId);
}

// ---------------------------------------------------------------------
// Consultas del equipo
// ---------------------------------------------------------------------

export const STAGES = {
  por_recibir: { label: "Por recibir", statuses: ["pendiente_de_entrega"] },
  por_autenticar: { label: "Por autenticar", statuses: ["recibida", "en_autenticacion"] },
  contrato: { label: "Esperando contrato", statuses: ["pendiente_de_contrato"] },
  fotografia: { label: "Por fotografiar", statuses: ["pendiente_de_fotografia"] },
  devoluciones: { label: "Devoluciones", statuses: ["devolucion_pendiente"] },
  publicadas: { label: "Publicadas", statuses: ["publicada"] },
} as const satisfies Record<string, { label: string; statuses: ProductStatus[] }>;
export type Stage = keyof typeof STAGES;

export interface PipelineRow {
  id: string;
  status: ProductStatus;
  sku: string | null;
  brand_name: string;
  model: string;
  category_name: string;
  seller_name: string | null;
  seller_email: string;
  price_cents: string | null;
  cover_url: string | null;
  plan_method: IntakeMethod | null;
  plan_scheduled_for: Date | null;
  plan_tracking: string | null;
  updated_at: Date;
}

export async function stageCounts(): Promise<Record<Stage, number>> {
  const rows = await query<{ status: ProductStatus; n: string }>("select status, count(*) as n from products group by status");
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  return Object.fromEntries(
    Object.entries(STAGES).map(([k, s]) => [k, (s.statuses as readonly ProductStatus[]).reduce((t, st) => t + (by[st] ?? 0), 0)]),
  ) as Record<Stage, number>;
}

export async function listStage(stage: Stage): Promise<PipelineRow[]> {
  return query<PipelineRow>(
    `select p.id, p.status, p.sku, b.name as brand_name, p.model, c.name as category_name,
            u.full_name as seller_name, u.email as seller_email,
            coalesce(p.listed_price_cents,
              (select offered_price_cents from consignment_requests r where r.product_id = p.id and r.seller_accepted_at is not null order by round desc limit 1)) as price_cents,
            coalesce(
              (select url from product_images i where i.product_id = p.id and i.kind = 'final' order by sort_order limit 1),
              (select url from product_images i where i.product_id = p.id and i.kind = 'preliminar' order by (i.slot = 'frente') desc, sort_order limit 1)) as cover_url,
            pl.method::text as plan_method, pl.scheduled_for as plan_scheduled_for, pl.tracking_number as plan_tracking,
            p.updated_at
     from products p
     join brands b on b.id = p.brand_id
     join product_categories c on c.id = p.category_id
     join users u on u.id = p.seller_id
     left join intake_plans pl on pl.product_id = p.id and pl.status = 'agendada'
     where p.status = any($1::product_status[])
     order by pl.scheduled_for asc nulls last, p.updated_at asc`,
    [STAGES[stage].statuses],
  );
}

export interface PieceForStaff {
  id: string;
  status: ProductStatus;
  sku: string | null;
  slug: string | null;
  brand_name: string;
  model: string;
  description: string | null;
  category_slug: string;
  category_name: string;
  includes: string[];
  declared_condition: string;
  size_label: string | null;
  size_system: string | null;
  final_condition_score: string | null;
  received_at: Date | null;
  seller_id: string;
  seller_name: string | null;
  seller_email: string;
  seller_phone: string | null;
  offered_price_cents: string | null;
  images: { id: string; kind: string; url: string; slot: string | null }[];
  plan: IntakePlan | null;
  intake: { method: IntakeMethod; received_at: Date; accessories_received: string[]; notes: string | null; received_by_name: string | null } | null;
  authentications: { result: AuthResult; checklist: Record<string, CheckAnswer>; notes: string | null; seller_message: string | null; created_at: Date; authenticator_name: string | null }[];
  agreement: AgreementView | null;
  history: { from_status: ProductStatus | null; to_status: ProductStatus; reason: string | null; created_at: Date; changed_by_name: string | null }[];
}

export async function getPieceForStaff(productId: string): Promise<PieceForStaff | null> {
  const [p] = await query<Omit<PieceForStaff, "images" | "plan" | "intake" | "authentications" | "agreement" | "history">>(
    `select p.id, p.status, p.sku, p.slug, b.name as brand_name, p.model, p.description, c.slug as category_slug, c.name as category_name,
            p.includes::text[] as includes, p.declared_condition, p.size_label, p.size_system, p.final_condition_score, p.received_at,
            p.seller_id, u.full_name as seller_name, u.email as seller_email, u.phone as seller_phone,
            (select offered_price_cents from consignment_requests r where r.product_id = p.id and r.seller_accepted_at is not null order by round desc limit 1) as offered_price_cents
     from products p join brands b on b.id = p.brand_id join product_categories c on c.id = p.category_id join users u on u.id = p.seller_id
     where p.id = $1`,
    [productId],
  );
  if (!p) return null;
  const [images, plan, intake, authentications, agreement, history] = await Promise.all([
    query<PieceForStaff["images"][number]>("select id, kind, url, slot from product_images where product_id = $1 order by kind, sort_order, created_at", [productId]),
    getActivePlan(productId),
    query<NonNullable<PieceForStaff["intake"]>>(
      `select i.method::text as method, i.received_at, i.accessories_received::text[] as accessories_received, i.notes, u.full_name as received_by_name
       from intake_records i join users u on u.id = i.received_by where i.product_id = $1 order by i.received_at desc limit 1`,
      [productId],
    ),
    query<PieceForStaff["authentications"][number]>(
      `select a.result, a.checklist, a.notes, a.seller_message, a.created_at, u.full_name as authenticator_name
       from authentication_records a join users u on u.id = a.authenticator_id where a.product_id = $1 order by a.created_at desc`,
      [productId],
    ),
    getAgreement(productId),
    query<PieceForStaff["history"][number]>(
      `select h.from_status, h.to_status, h.reason, h.created_at, u.full_name as changed_by_name
       from product_status_history h left join users u on u.id = h.changed_by where h.product_id = $1 order by h.created_at desc, h.id desc`,
      [productId],
    ),
  ]);
  return { ...p, images, plan, intake: intake[0] ?? null, authentications, agreement, history };
}

/** Lo que ve el vendedor sobre su pieza después de aceptar la oferta. */
export async function getSellerInventoryView(productId: string) {
  const [plan, agreement, lastAuth, published] = await Promise.all([
    getActivePlan(productId),
    getAgreement(productId),
    query<{ result: AuthResult; seller_message: string | null }>(
      "select result, seller_message from authentication_records where product_id = $1 order by created_at desc limit 1",
      [productId],
    ),
    query<{ slug: string | null; sku: string | null; received_at: Date | null }>("select slug, sku, received_at from products where id = $1", [productId]),
  ]);
  return { plan, agreement, lastAuth: lastAuth[0] ?? null, slug: published[0]?.slug ?? null, sku: published[0]?.sku ?? null, receivedAt: published[0]?.received_at ?? null };
}
