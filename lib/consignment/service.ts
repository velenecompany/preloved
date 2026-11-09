import "server-only";
import type { PoolClient } from "pg";
import { query, transaction } from "@/lib/db";
import { audit } from "@/lib/auth/service";
import { computeCommission, findRule, type CommissionBreakdown, type CommissionRule } from "@/lib/domain/commissions";
import { isKnownSlot, missingRequiredSlots, newPossessionCode, POSSESSION_SLOT } from "@/lib/domain/photo-guide";
import { assertTransition, PRODUCT_TRANSITIONS, type ProductStatus } from "@/lib/domain/state-machines";
import { isOwnedPhotoUrl, requestPhotoPrefix } from "@/lib/storage";

export const EDITABLE_STATUSES: ProductStatus[] = ["solicitud_borrador", "requiere_informacion"];
export const MAX_PHOTOS = 30;

export class ConsignmentError extends Error {}

// ---------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------

export async function getAcceptedBrands(): Promise<{ slug: string; name: string }[]> {
  return query("select slug, name from brands where is_accepted order by name");
}

export async function getEnabledCategories(): Promise<{ slug: string; name: string; commission_group: string }[]> {
  return query("select slug, name, commission_group from product_categories where is_enabled order by sort_order");
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Marca elegida de la lista o escrita a mano. Las nuevas quedan como no aceptadas hasta que el equipo las revise. */
async function resolveBrand(c: PoolClient, brandSlug: string | null, brandName: string | null): Promise<string> {
  if (brandSlug) {
    const { rows } = await c.query<{ id: string }>("select id from brands where slug = $1", [brandSlug]);
    if (rows[0]) return rows[0].id;
  }
  const name = (brandName ?? "").trim();
  if (name.length < 2) throw new ConsignmentError("Elige la marca o escríbela");
  const slug = slugify(name);
  const { rows } = await c.query<{ id: string }>(
    `insert into brands (slug, name, is_accepted) values ($1, $2, false)
     on conflict (slug) do update set slug = excluded.slug returning id`,
    [slug, name],
  );
  return rows[0].id;
}

// ---------------------------------------------------------------------
// Borrador
// ---------------------------------------------------------------------

export interface DraftInput {
  categorySlug: string;
  brandSlug: string | null;
  brandName: string | null;
  model: string;
  sizeLabel: string | null;
  sizeSystem: string | null;
  fit: string | null;
  declaredCondition: string;
  includes: string[];
  description: string | null;
  askingPriceCents: number;
}

export async function createDraft(userId: string, input: DraftInput): Promise<string> {
  return transaction(async (c) => {
    const { rows: cat } = await c.query<{ id: number }>("select id from product_categories where slug = $1 and is_enabled", [input.categorySlug]);
    if (!cat[0]) throw new ConsignmentError("Elige una categoría");
    const brandId = await resolveBrand(c, input.brandSlug, input.brandName);
    const { rows } = await c.query<{ id: string }>(
      `insert into products (seller_id, category_id, brand_id, model, size_label, size_system, fit, declared_condition, includes, description, asking_price_cents)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::included_item[], $10, $11) returning id`,
      [userId, cat[0].id, brandId, input.model, input.sizeLabel, input.sizeSystem, input.fit, input.declaredCondition, input.includes, input.description, input.askingPriceCents],
    );
    await c.query("insert into possession_proofs (product_id, code) values ($1, $2)", [rows[0].id, newPossessionCode()]);
    await audit(userId, "solicitud_creada", "products", rows[0].id, undefined, c);
    return rows[0].id;
  }, userId);
}

export async function updateDraft(userId: string, productId: string, input: DraftInput): Promise<void> {
  await transaction(async (c) => {
    const p = await lockOwnProduct(c, userId, productId);
    if (!EDITABLE_STATUSES.includes(p.status)) throw new ConsignmentError("Esta solicitud ya no se puede editar");
    const { rows: cat } = await c.query<{ id: number }>("select id from product_categories where slug = $1 and is_enabled", [input.categorySlug]);
    if (!cat[0]) throw new ConsignmentError("Elige una categoría");
    const brandId = await resolveBrand(c, input.brandSlug, input.brandName);
    await c.query(
      `update products set category_id = $2, brand_id = $3, model = $4, size_label = $5, size_system = $6, fit = $7,
         declared_condition = $8, includes = $9::included_item[], description = $10, asking_price_cents = $11
       where id = $1`,
      [productId, cat[0].id, brandId, input.model, input.sizeLabel, input.sizeSystem, input.fit, input.declaredCondition, input.includes, input.description, input.askingPriceCents],
    );
  }, userId);
}

async function lockOwnProduct(c: PoolClient, userId: string, productId: string): Promise<{ status: ProductStatus; category_slug: string }> {
  const { rows } = await c.query<{ status: ProductStatus; seller_id: string; category_slug: string }>(
    `select p.status, p.seller_id, c.slug as category_slug
     from products p join product_categories c on c.id = p.category_id
     where p.id = $1 for update of p`,
    [productId],
  );
  if (!rows[0] || rows[0].seller_id !== userId) throw new ConsignmentError("No encontramos esta solicitud");
  return rows[0];
}

// ---------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------

export async function canUploadPhoto(userId: string, productId: string): Promise<boolean> {
  const rows = await query<{ status: ProductStatus; n: string }>(
    `select p.status, (select count(*) from product_images i where i.product_id = p.id) as n
     from products p where p.id = $1 and p.seller_id = $2`,
    [productId, userId],
  );
  return Boolean(rows[0]) && EDITABLE_STATUSES.includes(rows[0].status) && Number(rows[0].n) < MAX_PHOTOS;
}

export async function addPhoto(userId: string, productId: string, slot: string, url: string, pathname: string): Promise<{ id: string }> {
  return transaction(async (c) => {
    const p = await lockOwnProduct(c, userId, productId);
    if (!EDITABLE_STATUSES.includes(p.status)) throw new ConsignmentError("Esta solicitud ya no acepta fotos");
    if (!isKnownSlot(p.category_slug, slot)) throw new ConsignmentError("Toma de foto desconocida");
    if (!isOwnedPhotoUrl(url, pathname, requestPhotoPrefix(userId, productId))) throw new ConsignmentError("La foto no corresponde a esta solicitud");
    const { rows: count } = await c.query<{ n: string }>("select count(*) as n from product_images where product_id = $1", [productId]);
    if (Number(count[0].n) >= MAX_PHOTOS) throw new ConsignmentError(`Máximo ${MAX_PHOTOS} fotos por solicitud`);

    const kind = slot === POSSESSION_SLOT ? "prueba_posesion" : "preliminar";
    if (slot === POSSESSION_SLOT) {
      await c.query("delete from product_images where product_id = $1 and slot = $2", [productId, POSSESSION_SLOT]);
    }
    const { rows } = await c.query<{ id: string }>(
      `insert into product_images (product_id, kind, url, pathname, slot, sort_order, created_by)
       values ($1, $2, $3, $4, $5, (select coalesce(max(sort_order), 0) + 1 from product_images where product_id = $1), $6)
       returning id`,
      [productId, kind, url, pathname, slot, userId],
    );
    if (slot === POSSESSION_SLOT) {
      await c.query("update possession_proofs set image_id = $2, verified_by = null, verified_at = null where product_id = $1", [productId, rows[0].id]);
    }
    return rows[0];
  }, userId);
}

export async function removePhoto(userId: string, productId: string, imageId: string): Promise<{ url: string; pathname: string } | null> {
  return transaction(async (c) => {
    const p = await lockOwnProduct(c, userId, productId);
    if (!EDITABLE_STATUSES.includes(p.status)) throw new ConsignmentError("Esta solicitud ya no se puede editar");
    await c.query("update possession_proofs set image_id = null where product_id = $1 and image_id = $2", [productId, imageId]);
    const { rows } = await c.query<{ url: string; pathname: string }>(
      "delete from product_images where id = $1 and product_id = $2 and kind in ('preliminar', 'prueba_posesion') returning url, pathname",
      [imageId, productId],
    );
    return rows[0] ?? null;
  }, userId);
}

// ---------------------------------------------------------------------
// Consulta del vendedor
// ---------------------------------------------------------------------

export interface RequestPhoto {
  id: string;
  url: string;
  slot: string | null;
  kind: string;
}

export interface RequestRound {
  round: number;
  seller_price_cents: string;
  offered_price_cents: string | null;
  decision: "pendiente" | "preaprobada" | "requiere_informacion" | "rechazada";
  admin_notes: string | null;
  rejection_reason: string | null;
  seller_note: string | null;
  seller_accepted_at: Date | null;
  decided_at: Date | null;
  created_at: Date;
}

export interface AssessmentRow {
  id: string;
  score: string | null;
  needs_more_photos: boolean;
  confidence: string | null;
  summary: string | null;
  defects: { area: string; description: string; severity?: string }[];
  missing_areas: string[];
  recommendations: string[];
  model: string | null;
  created_at: Date;
}

export interface RequestDetail {
  id: string;
  seller_id: string;
  seller_name: string | null;
  seller_email: string;
  status: ProductStatus;
  category_slug: string;
  category_name: string;
  commission_group: string;
  brand_slug: string;
  brand_name: string;
  brand_accepted: boolean;
  model: string;
  size_label: string | null;
  size_system: string | null;
  fit: string | null;
  declared_condition: string;
  includes: string[];
  description: string | null;
  asking_price_cents: string;
  possession_code: string;
  created_at: Date;
  updated_at: Date;
  photos: RequestPhoto[];
  rounds: RequestRound[];
  aiAssessment: AssessmentRow | null;
}

async function loadDetail(where: string, params: unknown[]): Promise<RequestDetail | null> {
  const [p] = await query<Omit<RequestDetail, "photos" | "rounds" | "aiAssessment">>(
    `select p.id, p.seller_id, u.full_name as seller_name, u.email as seller_email, p.status,
            c.slug as category_slug, c.name as category_name, c.commission_group,
            b.slug as brand_slug, b.name as brand_name, b.is_accepted as brand_accepted,
            p.model, p.size_label, p.size_system, p.fit, p.declared_condition, p.includes::text[] as includes,
            p.description, p.asking_price_cents, pp.code as possession_code, p.created_at, p.updated_at
     from products p
     join product_categories c on c.id = p.category_id
     join brands b on b.id = p.brand_id
     join users u on u.id = p.seller_id
     join possession_proofs pp on pp.product_id = p.id
     where ${where}`,
    params,
  );
  if (!p) return null;
  const [photos, rounds, ai] = await Promise.all([
    query<RequestPhoto>(
      "select id, url, slot, kind from product_images where product_id = $1 and kind in ('preliminar', 'prueba_posesion') order by sort_order",
      [p.id],
    ),
    query<RequestRound>(
      `select round, seller_price_cents, offered_price_cents, decision, admin_notes, rejection_reason, seller_note,
              seller_accepted_at, decided_at, created_at
       from consignment_requests where product_id = $1 order by round desc`,
      [p.id],
    ),
    query<AssessmentRow>(
      `select id, score, needs_more_photos, confidence, summary, defects, missing_areas, recommendations, model, created_at
       from condition_assessments where product_id = $1 and source = 'ia' order by created_at desc limit 1`,
      [p.id],
    ),
  ]);
  return { ...p, photos, rounds, aiAssessment: ai[0] ?? null };
}

export function getSellerRequest(userId: string, productId: string): Promise<RequestDetail | null> {
  if (!isUuid(productId)) return Promise.resolve(null);
  return loadDetail("p.id = $1 and p.seller_id = $2", [productId, userId]);
}

export function getRequestForReview(productId: string): Promise<RequestDetail | null> {
  if (!isUuid(productId)) return Promise.resolve(null);
  return loadDetail("p.id = $1", [productId]);
}

export function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export interface RequestSummary {
  id: string;
  status: ProductStatus;
  brand_name: string;
  model: string;
  category_name: string;
  asking_price_cents: string;
  offered_price_cents: string | null;
  cover_url: string | null;
  photo_count: string;
  updated_at: Date;
  seller_email?: string;
  seller_name?: string | null;
  submitted_at?: Date | null;
  ai_score?: string | null;
}

export async function listSellerRequests(userId: string): Promise<RequestSummary[]> {
  return query<RequestSummary>(
    `select p.id, p.status, b.name as brand_name, p.model, c.name as category_name, p.asking_price_cents,
            (select offered_price_cents from consignment_requests r where r.product_id = p.id order by round desc limit 1) as offered_price_cents,
            (select url from product_images i where i.product_id = p.id and i.kind = 'preliminar' order by (i.slot = 'frente') desc, sort_order limit 1) as cover_url,
            (select count(*) from product_images i where i.product_id = p.id and i.kind = 'preliminar') as photo_count,
            p.updated_at
     from products p join brands b on b.id = p.brand_id join product_categories c on c.id = p.category_id
     where p.seller_id = $1 and p.status <> 'retirada_por_vendedor'
     order by p.updated_at desc`,
    [userId],
  );
}

// ---------------------------------------------------------------------
// Envío a revisión
// ---------------------------------------------------------------------

export function submissionBlockers(detail: Pick<RequestDetail, "category_slug" | "photos">): string[] {
  const blockers = missingRequiredSlots(
    detail.category_slug,
    detail.photos.filter((p) => p.kind === "preliminar").map((p) => p.slot ?? ""),
  ).map((s) => `Falta la foto: ${s.label}`);
  if (!detail.photos.some((p) => p.slot === POSSESSION_SLOT)) blockers.push("Falta la foto de prueba de posesión con tu código");
  return blockers;
}

export async function submitRequest(userId: string, productId: string): Promise<void> {
  const detail = await getSellerRequest(userId, productId);
  if (!detail) throw new ConsignmentError("No encontramos esta solicitud");
  if (!EDITABLE_STATUSES.includes(detail.status)) throw new ConsignmentError("Esta solicitud ya se envió");
  const blockers = submissionBlockers(detail);
  if (blockers.length) throw new ConsignmentError(blockers[0]);

  await transaction(async (c) => {
    const p = await lockOwnProduct(c, userId, productId);
    assertTransition("pieza", PRODUCT_TRANSITIONS, p.status, "solicitud_enviada");
    await c.query("update products set status = 'solicitud_enviada' where id = $1", [productId]);
    await c.query(
      `insert into consignment_requests (product_id, round, seller_price_cents)
       values ($1, coalesce((select max(round) from consignment_requests where product_id = $1), 0) + 1, $2)`,
      [productId, detail.asking_price_cents],
    );
    await audit(userId, "solicitud_enviada", "products", productId, undefined, c);
  }, userId);
}

export async function withdrawRequest(userId: string, productId: string): Promise<void> {
  await transaction(async (c) => {
    const p = await lockOwnProduct(c, userId, productId);
    assertTransition("pieza", PRODUCT_TRANSITIONS, p.status, "retirada_por_vendedor");
    await c.query("update products set status = 'retirada_por_vendedor' where id = $1", [productId]);
    await audit(userId, "solicitud_retirada", "products", productId, undefined, c);
  }, userId);
}

// ---------------------------------------------------------------------
// Respuesta del vendedor a la preaprobación
// ---------------------------------------------------------------------

export async function acceptOffer(userId: string, productId: string): Promise<void> {
  await transaction(async (c) => {
    const p = await lockOwnProduct(c, userId, productId);
    assertTransition("pieza", PRODUCT_TRANSITIONS, p.status, "pendiente_de_entrega");
    const { rows: payout } = await c.query("select 1 from seller_payout_accounts where seller_id = $1", [userId]);
    if (!payout[0]) throw new ConsignmentError("Registra tus datos bancarios antes de aceptar la oferta");
    const { rowCount } = await c.query(
      `update consignment_requests set seller_accepted_at = now()
       where product_id = $1 and decision = 'preaprobada'
         and round = (select max(round) from consignment_requests where product_id = $1)`,
      [productId],
    );
    if (!rowCount) throw new ConsignmentError("No hay una oferta vigente");
    await c.query("update products set status = 'pendiente_de_entrega' where id = $1", [productId]);
    await audit(userId, "oferta_aceptada", "products", productId, undefined, c);
  }, userId);
}

export async function counterOffer(userId: string, productId: string, priceCents: number, note: string | null): Promise<void> {
  await transaction(async (c) => {
    const p = await lockOwnProduct(c, userId, productId);
    if (p.status !== "preaprobada") throw new ConsignmentError("Solo puedes contraproponer sobre una oferta vigente");
    const { rows: rounds } = await c.query<{ n: string }>("select count(*) as n from consignment_requests where product_id = $1", [productId]);
    if (Number(rounds[0].n) >= 4) throw new ConsignmentError("Llegaste al máximo de contrapropuestas. Acepta la oferta o escríbenos.");
    await c.query("update products set status = 'solicitud_enviada', asking_price_cents = $2 where id = $1", [productId, priceCents]);
    await c.query(
      `insert into consignment_requests (product_id, round, seller_price_cents, seller_note)
       values ($1, (select max(round) from consignment_requests where product_id = $1) + 1, $2, $3)`,
      [productId, priceCents, note],
    );
    await audit(userId, "contrapropuesta", "products", productId, { precio_centavos: priceCents }, c);
  }, userId);
}

// ---------------------------------------------------------------------
// Revisión del equipo
// ---------------------------------------------------------------------

export async function listRequestsForReview(): Promise<RequestSummary[]> {
  return query<RequestSummary>(
    `select p.id, p.status, b.name as brand_name, p.model, c.name as category_name, p.asking_price_cents,
            null as offered_price_cents,
            (select url from product_images i where i.product_id = p.id and i.kind = 'preliminar' order by (i.slot = 'frente') desc, sort_order limit 1) as cover_url,
            (select count(*) from product_images i where i.product_id = p.id and i.kind = 'preliminar') as photo_count,
            p.updated_at, u.email as seller_email, u.full_name as seller_name,
            (select created_at from consignment_requests r where r.product_id = p.id order by round desc limit 1) as submitted_at,
            (select score from condition_assessments a where a.product_id = p.id and a.source = 'ia' order by created_at desc limit 1) as ai_score
     from products p join brands b on b.id = p.brand_id join product_categories c on c.id = p.category_id join users u on u.id = p.seller_id
     where p.status = 'solicitud_enviada'
     order by submitted_at asc nulls last`,
  );
}

export async function activeRules(group: string): Promise<CommissionRule[]> {
  const rows = await query<{ id: string; commission_group: string; min_price_cents: string; max_price_cents: string | null; rate_bps: number; min_fee_cents: string }>(
    "select id, commission_group, min_price_cents, max_price_cents, rate_bps, min_fee_cents from commission_rules where valid_to is null and commission_group = $1",
    [group],
  );
  return rows.map((r) => ({
    id: r.id,
    group: r.commission_group,
    minPriceCents: Number(r.min_price_cents),
    maxPriceCents: r.max_price_cents === null ? null : Number(r.max_price_cents),
    rateBps: r.rate_bps,
    minFeeCents: Number(r.min_fee_cents),
  }));
}

export async function commissionPreview(group: string, priceCents: number): Promise<CommissionBreakdown> {
  const rules = await activeRules(group);
  return computeCommission(priceCents, findRule(rules, group, priceCents));
}

export type ReviewDecision =
  | { decision: "preaprobada"; offeredPriceCents: number; notes: string | null }
  | { decision: "requiere_informacion"; notes: string }
  | { decision: "rechazada"; reason: string };

export async function decideRequest(reviewerId: string, productId: string, d: ReviewDecision): Promise<void> {
  await transaction(async (c) => {
    const { rows } = await c.query<{ status: ProductStatus }>("select status from products where id = $1 for update", [productId]);
    if (!rows[0]) throw new ConsignmentError("No existe la solicitud");
    if (rows[0].status !== "solicitud_enviada") throw new ConsignmentError("Esta solicitud ya fue respondida");
    assertTransition("pieza", PRODUCT_TRANSITIONS, rows[0].status, d.decision);

    const { rowCount } = await c.query(
      `update consignment_requests set decision = $2, offered_price_cents = $3, admin_notes = $4, rejection_reason = $5,
              decided_by = $6, decided_at = now()
       where product_id = $1 and decision = 'pendiente'
         and round = (select max(round) from consignment_requests where product_id = $1)`,
      [
        productId,
        d.decision,
        d.decision === "preaprobada" ? d.offeredPriceCents : null,
        d.decision === "rechazada" ? null : d.notes,
        d.decision === "rechazada" ? d.reason : null,
        reviewerId,
      ],
    );
    if (!rowCount) throw new ConsignmentError("No hay una ronda pendiente de respuesta");
    await c.query("update products set status = $2 where id = $1", [productId, d.decision]);
    await audit(reviewerId, `solicitud_${d.decision}`, "products", productId, d.decision === "preaprobada" ? { oferta_centavos: d.offeredPriceCents } : undefined, c);
  }, reviewerId);
}

export async function acceptBrand(reviewerId: string, brandSlug: string): Promise<void> {
  await query("update brands set is_accepted = true where slug = $1", [brandSlug]);
  await audit(reviewerId, "marca_aceptada", "brands", brandSlug);
}

export async function countPendingRequests(): Promise<number> {
  const rows = await query<{ n: string }>("select count(*) as n from products where status = 'solicitud_enviada'");
  return Number(rows[0].n);
}
