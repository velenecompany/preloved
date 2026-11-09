"use server";

import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireUser } from "@/lib/auth/session";
import { draftSchema, priceSchema, readDraftForm } from "@/lib/consignment/schemas";
import {
  acceptOffer,
  addPhoto,
  ConsignmentError,
  counterOffer,
  createDraft,
  getSellerRequest,
  isUuid,
  removePhoto,
  submitRequest,
  updateDraft,
  withdrawRequest,
} from "@/lib/consignment/service";
import { appUrl, requestReceivedEmail, sendEmail } from "@/lib/email";

function errors(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

function failure(e: unknown): FormState {
  if (e instanceof ConsignmentError) return { error: e.message };
  throw e;
}

const detailPath = (id: string) => `/cuenta/consignaciones/${id}`;

async function verifiedSeller() {
  const user = await requireUser("/cuenta/consignaciones");
  if (!user.emailVerified) throw new ConsignmentError("Confirma tu correo para consignar piezas");
  return user;
}

// ---------------------------------------------------------------------
// Datos de la pieza
// ---------------------------------------------------------------------

export async function createDraftAction(_prev: FormState, formData: FormData): Promise<FormState> {
  let id: string;
  try {
    const user = await verifiedSeller();
    const parsed = draftSchema.safeParse(readDraftForm(formData));
    if (!parsed.success) return { fieldErrors: errors(parsed.error) };
    id = await createDraft(user.id, parsed.data);
  } catch (e) {
    return failure(e);
  }
  redirect(`${detailPath(id)}?paso=fotos`);
}

export async function updateDraftAction(productId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await verifiedSeller();
    const parsed = draftSchema.safeParse(readDraftForm(formData));
    if (!parsed.success) return { fieldErrors: errors(parsed.error) };
    await updateDraft(user.id, productId, parsed.data);
  } catch (e) {
    return failure(e);
  }
  revalidatePath(detailPath(productId));
  return { success: "Guardamos los datos de la pieza." };
}

// ---------------------------------------------------------------------
// Fotos (se llaman desde el cliente después de subir el archivo)
// ---------------------------------------------------------------------

export async function registerPhotoAction(productId: string, slot: string, url: string, pathname: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const user = await verifiedSeller();
    const { id } = await addPhoto(user.id, productId, slot, url, pathname);
    revalidatePath(detailPath(productId));
    return { ok: true, id };
  } catch (e) {
    if (e instanceof ConsignmentError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function removePhotoAction(productId: string, imageId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const user = await verifiedSeller();
    if (!isUuid(imageId)) return { ok: false, error: "Foto inválida" };
    const removed = await removePhoto(user.id, productId, imageId);
    if (removed && removed.url.startsWith("https://") && process.env.BLOB_READ_WRITE_TOKEN) {
      await del(removed.url).catch((err) => console.error("No se pudo borrar la foto de Blob", err));
    }
    revalidatePath(detailPath(productId));
    return { ok: true };
  } catch (e) {
    if (e instanceof ConsignmentError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------
// Enviar, retirar y responder a la propuesta
// ---------------------------------------------------------------------

export async function submitAction(productId: string): Promise<FormState> {
  try {
    const user = await verifiedSeller();
    await submitRequest(user.id, productId);
    const detail = await getSellerRequest(user.id, productId);
    if (detail) {
      await sendEmail({ to: user.email, ...requestReceivedEmail(`${detail.brand_name} ${detail.model}`, appUrl(detailPath(productId))) });
    }
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/cuenta/consignaciones");
  redirect(`${detailPath(productId)}?aviso=enviada`);
}

export async function withdrawAction(productId: string): Promise<void> {
  const user = await requireUser("/cuenta/consignaciones");
  await withdrawRequest(user.id, productId);
  revalidatePath("/cuenta/consignaciones");
  redirect("/cuenta/consignaciones?aviso=retirada");
}

export async function acceptOfferAction(productId: string): Promise<FormState> {
  try {
    const user = await verifiedSeller();
    await acceptOffer(user.id, productId);
  } catch (e) {
    return failure(e);
  }
  revalidatePath(detailPath(productId));
  redirect(`${detailPath(productId)}?aviso=aceptada`);
}

const counterSchema = z.object({
  price: priceSchema,
  note: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(500).nullable()),
});

export async function counterOfferAction(productId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await verifiedSeller();
    const parsed = counterSchema.safeParse({ price: String(formData.get("price") ?? "").replace(/[$,\s]/g, ""), note: formData.get("note") });
    if (!parsed.success) return { fieldErrors: errors(parsed.error) };
    await counterOffer(user.id, productId, parsed.data.price, parsed.data.note);
  } catch (e) {
    return failure(e);
  }
  revalidatePath(detailPath(productId));
  redirect(`${detailPath(productId)}?aviso=contrapropuesta`);
}
