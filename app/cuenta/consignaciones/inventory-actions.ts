"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { requireUser } from "@/lib/auth/session";
import { getSellerRequest } from "@/lib/consignment/service";
import { describeSlot } from "@/lib/domain/inventory";
import { acceptAgreement, declineAgreement, getIntakeOptions, InventoryError, scheduleIntake, setTracking, type IntakeInput } from "@/lib/inventory/service";
import { appUrl, intakeScheduledEmail, sendEmail } from "@/lib/email";
import { clientIp } from "@/lib/request";

const detailPath = (id: string) => `/cuenta/consignaciones/${id}`;
const text = (min: number, max: number, msg: string) => z.string().trim().min(min, msg).max(max);

function errors(e: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of e.issues) out[String(i.path[i.path.length - 1])] ??= i.message;
  return out;
}

function failure(e: unknown): FormState {
  if (e instanceof InventoryError) return { error: e.message };
  throw e;
}

const addressSchema = z.object({
  recipient: text(3, 120, "Escribe quién entrega la pieza"),
  phone: z.string().trim().regex(/^[0-9 +()-]{10,20}$/, "Escribe un teléfono de 10 dígitos"),
  street: text(3, 160, "Escribe la calle y el número"),
  neighborhood: text(2, 120, "Escribe la colonia"),
  municipality: text(2, 80, "Elige el municipio"),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Código postal de 5 dígitos"),
  references: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(300).nullable()),
});

const slot = z.string({ required_error: "Elige un horario", invalid_type_error: "Elige un horario" }).min(1, "Elige un horario");

const intakeSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("sucursal"), slot }),
  z.object({ method: z.literal("recoleccion"), slot, address: addressSchema }),
  z.object({ method: z.literal("paqueteria") }),
], { errorMap: () => ({ message: "Elige cómo nos entregas la pieza" }) });

export async function scheduleIntakeAction(productId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser(detailPath(productId));
    const f = (k: string) => formData.get(k) ?? undefined;
    const parsed = intakeSchema.safeParse({
      method: f("method"),
      slot: f("slot"),
      address: {
        recipient: f("recipient"),
        phone: f("phone"),
        street: f("street"),
        neighborhood: f("neighborhood"),
        municipality: f("municipality"),
        postalCode: f("postalCode"),
        references: f("references"),
      },
    });
    if (!parsed.success) return { fieldErrors: errors(parsed.error) };
    const d = parsed.data;
    const input: IntakeInput =
      d.method === "sucursal"
        ? { method: "sucursal", scheduledFor: d.slot }
        : d.method === "recoleccion"
          ? { method: "recoleccion", scheduledFor: d.slot, address: d.address }
          : { method: "paqueteria" };
    const plan = await scheduleIntake(user.id, productId, input);

    const [options, r] = await Promise.all([getIntakeOptions(), getSellerRequest(user.id, productId)]);
    if (r) {
      const when = plan.scheduled_for ? describeSlot(options, plan.method, new Date(plan.scheduled_for)) : null;
      const summary =
        input.method === "sucursal"
          ? [`Cita en nuestro punto: ${when}.`, `Dirección: ${options.sucursal.address}.`, `Lleva la pieza con todo lo que incluye y menciona tu código ${r.possession_code}.`]
          : input.method === "recoleccion"
            ? [`Recolección: ${when}.`, `En ${input.address.street}, ${input.address.neighborhood}, ${input.address.municipality}.`, "Ten la pieza lista con todo lo que incluye."]
            : [`Envío por paquetería a: ${options.paqueteria.address}.`, `Escribe tu código ${r.possession_code} por fuera del paquete y registra la guía en tu cuenta.`];
      await sendEmail({ to: user.email, ...intakeScheduledEmail(`${r.brand_name} ${r.model}`, summary, appUrl(detailPath(productId))) });
    }
  } catch (e) {
    return failure(e);
  }
  revalidatePath(detailPath(productId));
  redirect(`${detailPath(productId)}?aviso=entrega`);
}

const trackingSchema = z.object({
  carrier: text(2, 60, "Escribe la paquetería"),
  tracking: z.string().trim().regex(/^[A-Za-z0-9-]{6,40}$/, "Escribe el número de guía (solo letras y números)"),
});

export async function trackingAction(productId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser(detailPath(productId));
    const parsed = trackingSchema.safeParse({ carrier: formData.get("carrier"), tracking: formData.get("tracking") });
    if (!parsed.success) return { fieldErrors: errors(parsed.error) };
    await setTracking(user.id, productId, parsed.data.carrier, parsed.data.tracking);
  } catch (e) {
    return failure(e);
  }
  revalidatePath(detailPath(productId));
  return { success: "Guardamos tu guía. Te avisamos cuando llegue." };
}

export async function acceptContractAction(productId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const user = await requireUser(detailPath(productId));
    if (formData.get("acepto") !== "on") return { fieldErrors: { acepto: "Marca la casilla para aceptar el contrato" } };
    const ua = (await headers()).get("user-agent");
    await acceptAgreement(user.id, productId, await clientIp(), ua);
  } catch (e) {
    return failure(e);
  }
  revalidatePath(detailPath(productId));
  redirect(`${detailPath(productId)}?aviso=contrato`);
}

export async function declineContractAction(productId: string): Promise<void> {
  const user = await requireUser(detailPath(productId));
  await declineAgreement(user.id, productId);
  revalidatePath(detailPath(productId));
  redirect(`${detailPath(productId)}?aviso=sin-contrato`);
}
