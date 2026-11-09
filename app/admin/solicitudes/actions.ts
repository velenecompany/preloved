"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireRole } from "@/lib/auth/session";
import { priceSchema } from "@/lib/consignment/schemas";
import { acceptBrand, commissionPreview, ConsignmentError, decideRequest, getRequestForReview, type ReviewDecision } from "@/lib/consignment/service";
import { appUrl, requestNeedsInfoEmail, requestPreapprovedEmail, requestRejectedEmail, sendEmail } from "@/lib/email";
import { formatMXN } from "@/lib/domain/money";

const REVIEWERS = ["admin", "autenticador"] as const;

const optionalText = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(1500).nullable());

const decisionSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("preaprobada"), offeredPrice: priceSchema, notes: optionalText }),
  z.object({ decision: z.literal("requiere_informacion"), notes: z.string().trim().min(10, "Explica qué necesitas (al menos 10 caracteres)").max(1500) }),
  z.object({ decision: z.literal("rechazada"), reason: z.string().trim().min(5, "Escribe el motivo para el vendedor").max(1500) }),
]);

export async function decideAction(productId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const reviewer = await requireRole(REVIEWERS, `/admin/solicitudes/${productId}`);
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const parsed = decisionSchema.safeParse({ ...raw, offeredPrice: raw.offeredPrice?.replace(/[$,\s]/g, "") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }

  const d = parsed.data;
  const decision: ReviewDecision =
    d.decision === "preaprobada"
      ? { decision: "preaprobada", offeredPriceCents: d.offeredPrice, notes: d.notes }
      : d.decision === "requiere_informacion"
        ? { decision: "requiere_informacion", notes: d.notes }
        : { decision: "rechazada", reason: d.reason };

  try {
    await decideRequest(reviewer.id, productId, decision);
  } catch (e) {
    if (e instanceof ConsignmentError) return { error: e.message };
    throw e;
  }

  const r = await getRequestForReview(productId);
  if (r) {
    const piece = `${r.brand_name} ${r.model}`;
    const url = appUrl(`/cuenta/consignaciones/${productId}`);
    if (decision.decision === "preaprobada") {
      const b = await commissionPreview(r.commission_group, decision.offeredPriceCents);
      await sendEmail({ to: r.seller_email, ...requestPreapprovedEmail(piece, formatMXN(b.salePriceCents), formatMXN(b.sellerGrossCents), url) });
    } else if (decision.decision === "requiere_informacion") {
      await sendEmail({ to: r.seller_email, ...requestNeedsInfoEmail(piece, decision.notes, url) });
    } else {
      await sendEmail({ to: r.seller_email, ...requestRejectedEmail(piece, decision.reason) });
    }
  }

  revalidatePath("/admin/solicitudes");
  redirect(`/admin/solicitudes?aviso=${decision.decision}`);
}

export async function acceptBrandAction(productId: string, brandSlug: string): Promise<void> {
  const reviewer = await requireRole(["admin"], `/admin/solicitudes/${productId}`);
  await acceptBrand(reviewer.id, brandSlug);
  revalidatePath(`/admin/solicitudes/${productId}`);
}
