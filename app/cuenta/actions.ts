"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { passwordSchema } from "@/lib/auth/password";
import { requireUser, startSession } from "@/lib/auth/session";
import {
  changePassword,
  checkPassword,
  issueVerificationToken,
  recentVerificationRequests,
  savePayoutAccount,
  updateProfile,
} from "@/lib/auth/service";
import { isValidClabe } from "@/lib/domain/clabe";
import { appUrl, passwordChangedEmail, payoutAccountChangedEmail, sendEmail, verifyEmail } from "@/lib/email";

function firstErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

// ---------------------------------------------------------------------
// Perfil
// ---------------------------------------------------------------------

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Escribe tu nombre").max(120),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s()-]/g, ""))
    .refine((v) => v === "" || /^\+?\d{10,13}$/.test(v), "Escribe 10 dígitos, o con lada de país"),
});

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: firstErrors(parsed.error) };
  await updateProfile(user.id, parsed.data.fullName, parsed.data.phone || null);
  revalidatePath("/cuenta");
  return { success: "Guardamos tus datos." };
}

// ---------------------------------------------------------------------
// Verificación de correo
// ---------------------------------------------------------------------

export async function resendVerificationAction(): Promise<FormState> {
  const user = await requireUser();
  if (user.emailVerified) return { success: "Tu correo ya está confirmado." };
  if ((await recentVerificationRequests(user.id)) >= 3) {
    return { error: "Ya te enviamos varios enlaces en la última hora. Revisa tu correo, incluida la carpeta de spam." };
  }
  const token = await issueVerificationToken(user.id);
  await sendEmail({ to: user.email, ...verifyEmail(appUrl(`/verificar?token=${token}`)) });
  return { success: `Te enviamos un enlace nuevo a ${user.email}.` };
}

// ---------------------------------------------------------------------
// Cambio de contraseña
// ---------------------------------------------------------------------

const changePasswordSchema = z
  .object({ current: z.string().min(1, "Escribe tu contraseña actual"), password: passwordSchema, confirm: z.string() })
  .refine((d) => d.password === d.confirm, { message: "Las contraseñas no coinciden", path: ["confirm"] })
  .refine((d) => d.password !== d.current, { message: "Elige una contraseña distinta a la actual", path: ["password"] });

export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: firstErrors(parsed.error) };

  const result = await changePassword(user.id, parsed.data.current, parsed.data.password);
  if (!result.ok) return { fieldErrors: { current: "La contraseña actual no es correcta" } };

  // La sesión actual sigue abierta con la versión nueva; las demás quedan cerradas.
  await startSession(user.id, result.sessionVersion);
  await sendEmail({ to: user.email, ...passwordChangedEmail() });
  return { success: "Cambiamos tu contraseña y cerramos tus otras sesiones." };
}

// ---------------------------------------------------------------------
// Datos bancarios
// ---------------------------------------------------------------------

const payoutSchema = z.object({
  holderName: z.string().trim().min(3, "Escribe el nombre del titular como aparece en el banco").max(120),
  clabe: z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => /^\d{18}$/.test(v), "La CLABE tiene 18 dígitos")
    .refine(isValidClabe, "Revisa la CLABE: el dígito verificador no coincide"),
  bankName: z.string().trim().min(2, "Escribe el nombre del banco").max(60),
  rfc: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(v), "El RFC no tiene un formato válido"),
  currentPassword: z.string().min(1, "Confirma con tu contraseña"),
});

export async function savePayoutAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/cuenta/datos-bancarios");
  if (!user.emailVerified) return { error: "Primero confirma tu correo. Te enviamos el enlace al registrarte." };

  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { holderName: raw.holderName ?? "", clabe: raw.clabe ?? "", bankName: raw.bankName ?? "", rfc: raw.rfc ?? "" };
  const parsed = payoutSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: firstErrors(parsed.error), values };

  if (!(await checkPassword(user.id, parsed.data.currentPassword))) {
    return { fieldErrors: { currentPassword: "La contraseña no es correcta" }, values };
  }

  const { clabeChanged, isNew } = await savePayoutAccount(user.id, {
    holderName: parsed.data.holderName,
    bankName: parsed.data.bankName,
    clabe: parsed.data.clabe,
    rfc: parsed.data.rfc || null,
  });
  if (clabeChanged || isNew) await sendEmail({ to: user.email, ...payoutAccountChangedEmail(parsed.data.clabe.slice(-4)) });

  revalidatePath("/cuenta", "layout");
  return {
    success: isNew
      ? "Listo. Ya puedes consignar piezas; aquí te pagaremos tus ventas."
      : clabeChanged
        ? "Actualizamos tu CLABE. Te enviamos un aviso por correo."
        : "Guardamos tus datos.",
  };
}
