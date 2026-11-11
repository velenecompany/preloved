"use server";

import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireRole } from "@/lib/auth/session";
import { AUTHENTICATORS, OPERATIONS, PHOTOGRAPHERS } from "@/lib/inventory/roles";
import { isUuid } from "@/lib/consignment/service";
import { INCLUDED_ITEMS } from "@/lib/consignment/schemas";
import { checklistFor, checklistProblem, formatLongDate, INTAKE_METHODS, type CheckAnswer } from "@/lib/domain/inventory";
import { formatMXN } from "@/lib/domain/money";
import {
  addInventoryPhoto,
  getPieceForStaff,
  InventoryError,
  markReturned,
  publishPiece,
  recordAuthentication,
  registerIntake,
  removeInventoryPhoto,
  type InventoryPhotoKind,
} from "@/lib/inventory/service";
import {
  appUrl,
  authenticationFailedEmail,
  contractReadyEmail,
  pieceReceivedEmail,
  piecePublishedEmail,
  pieceReturnedEmail,
  sendEmail,
} from "@/lib/email";


const piecePath = (id: string) => `/admin/inventario/${id}`;
const sellerPath = (id: string) => `/cuenta/consignaciones/${id}`;
const optionalText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable());

function failure(e: unknown): FormState {
  if (e instanceof InventoryError) return { error: e.message };
  throw e;
}

// ---------------------------------------------------------------------
// Fotos del equipo
// ---------------------------------------------------------------------

const PHOTO_KINDS: InventoryPhotoKind[] = ["recepcion", "defecto", "final"];

export async function registerInventoryPhotoAction(productId: string, kind: string, url: string, pathname: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const staff = await requireRole(PHOTOGRAPHERS, piecePath(productId));
  if (!isUuid(productId) || !PHOTO_KINDS.includes(kind as InventoryPhotoKind)) return { ok: false, error: "Foto inválida" };
  try {
    const { id } = await addInventoryPhoto(staff.id, productId, kind as InventoryPhotoKind, url, pathname);
    revalidatePath(piecePath(productId));
    return { ok: true, id };
  } catch (e) {
    if (e instanceof InventoryError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function removeInventoryPhotoAction(productId: string, imageId: string): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireRole(PHOTOGRAPHERS, piecePath(productId));
  if (!isUuid(productId) || !isUuid(imageId)) return { ok: false, error: "Foto inválida" };
  try {
    const removed = await removeInventoryPhoto(staff.id, productId, imageId);
    if (removed?.url.startsWith("https://") && process.env.BLOB_READ_WRITE_TOKEN) {
      await del(removed.url).catch((err) => console.error("No se pudo borrar la foto de Blob", err));
    }
    revalidatePath(piecePath(productId));
    return { ok: true };
  } catch (e) {
    if (e instanceof InventoryError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------
// Recepción
// ---------------------------------------------------------------------

const intakeSchema = z.object({
  method: z.enum(INTAKE_METHODS as [string, ...string[]], { errorMap: () => ({ message: "Elige cómo llegó la pieza" }) }),
  accessories: z.array(z.enum(INCLUDED_ITEMS)),
  notes: optionalText(1500),
});

export async function intakeAction(productId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireRole(OPERATIONS, piecePath(productId));
  const parsed = intakeSchema.safeParse({ method: formData.get("method"), accessories: formData.getAll("accessories"), notes: formData.get("notes") });
  if (!parsed.success) return { fieldErrors: { [String(parsed.error.issues[0].path[0])]: parsed.error.issues[0].message } };
  let sku: string;
  try {
    ({ sku } = await registerIntake(staff.id, productId, { ...parsed.data, method: parsed.data.method as (typeof INTAKE_METHODS)[number] }));
  } catch (e) {
    return failure(e);
  }
  const p = await getPieceForStaff(productId);
  if (p) await sendEmail({ to: p.seller_email, ...pieceReceivedEmail(`${p.brand_name} ${p.model}`, sku, appUrl(sellerPath(productId))) });
  revalidatePath("/admin/inventario");
  redirect(`${piecePath(productId)}?aviso=recibida`);
}

// ---------------------------------------------------------------------
// Autenticación
// ---------------------------------------------------------------------

const authSchema = z.object({
  result: z.enum(["autentica", "no_autentica", "no_concluyente"], { errorMap: () => ({ message: "Elige el resultado" }) }),
  conditionScore: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number({ invalid_type_error: "Calificación del 1 al 10" }).min(1, "Calificación del 1 al 10").max(10, "Calificación del 1 al 10").nullable(),
  ),
  notes: optionalText(2000),
  sellerMessage: optionalText(1000),
});

export async function authenticationAction(productId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireRole(AUTHENTICATORS, piecePath(productId));
  const piece = await getPieceForStaff(productId);
  if (!piece) return { error: "No encontramos la pieza" };

  const parsed = authSchema.safeParse({
    result: formData.get("result"),
    conditionScore: formData.get("conditionScore"),
    notes: formData.get("notes"),
    sellerMessage: formData.get("sellerMessage"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }
  const answers: Record<string, CheckAnswer> = {};
  for (const item of checklistFor(piece.category_slug)) {
    const v = formData.get(`check_${item.id}`);
    if (v === "ok" || v === "falla" || v === "na") answers[item.id] = v;
  }
  const d = parsed.data;
  // Primero el checklist: es lo que más tiempo toma y lo que más importa revisar.
  const problem = checklistProblem(checklistFor(piece.category_slug), answers, d.result);
  if (problem) return { error: problem };
  if (d.result === "autentica" && d.conditionScore === null) return { fieldErrors: { conditionScore: "Califica la condición confirmada" } };
  if (d.result === "no_autentica" && !d.sellerMessage) return { fieldErrors: { sellerMessage: "Explica al vendedor por qué no pasó" } };

  let status: string;
  try {
    ({ status } = await recordAuthentication(staff.id, productId, { answers, ...d }));
  } catch (e) {
    return failure(e);
  }

  const name = `${piece.brand_name} ${piece.model}`;
  if (status === "pendiente_de_contrato") {
    const p = await getPieceForStaff(productId);
    const a = p?.agreement;
    if (p && a) {
      await sendEmail({
        to: p.seller_email,
        ...contractReadyEmail(
          name,
          formatMXN(a.breakdown.salePriceCents),
          formatMXN(a.breakdown.sellerGrossCents),
          a.hold_until ? formatLongDate(new Date(a.hold_until)) : `${a.min_hold_days} días después de recibirla`,
          appUrl(sellerPath(productId)),
        ),
      });
    }
  } else if (status === "devolucion_pendiente" && d.sellerMessage) {
    await sendEmail({ to: piece.seller_email, ...authenticationFailedEmail(name, d.sellerMessage, appUrl(sellerPath(productId))) });
  }
  revalidatePath("/admin/inventario");
  redirect(`${piecePath(productId)}?aviso=${d.result}`);
}

// ---------------------------------------------------------------------
// Publicación y devoluciones
// ---------------------------------------------------------------------

export async function publishAction(productId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireRole(OPERATIONS, piecePath(productId));
  const parsed = optionalText(2000).safeParse(formData.get("description"));
  if (!parsed.success) return { fieldErrors: { description: "Máximo 2,000 caracteres" } };
  let slug: string;
  try {
    ({ slug } = await publishPiece(staff.id, productId, parsed.data));
  } catch (e) {
    return failure(e);
  }
  const p = await getPieceForStaff(productId);
  if (p?.agreement) {
    await sendEmail({ to: p.seller_email, ...piecePublishedEmail(`${p.brand_name} ${p.model}`, formatMXN(p.agreement.breakdown.salePriceCents), appUrl(`/producto/${slug}`)) });
  }
  revalidatePath("/admin/inventario");
  revalidatePath("/catalogo");
  revalidatePath("/");
  redirect(`${piecePath(productId)}?aviso=publicada`);
}

export async function returnAction(productId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireRole(OPERATIONS, piecePath(productId));
  const parsed = optionalText(1000).safeParse(formData.get("notes"));
  if (!parsed.success) return { fieldErrors: { notes: "Máximo 1,000 caracteres" } };
  try {
    await markReturned(staff.id, productId, parsed.data);
  } catch (e) {
    return failure(e);
  }
  const p = await getPieceForStaff(productId);
  if (p) await sendEmail({ to: p.seller_email, ...pieceReturnedEmail(`${p.brand_name} ${p.model}`) });
  revalidatePath("/admin/inventario");
  redirect(`${piecePath(productId)}?aviso=devuelta`);
}
