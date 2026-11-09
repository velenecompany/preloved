"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/form";
import { emailSchema, passwordSchema } from "@/lib/auth/password";
import { safeRedirect } from "@/lib/auth/jwt";
import { endSession, startSession } from "@/lib/auth/session";
import { authenticate, createPasswordReset, createUser, resetPassword } from "@/lib/auth/service";
import { appUrl, passwordChangedEmail, resetEmail, sendEmail, welcomeEmail } from "@/lib/email";
import { clientIp } from "@/lib/request";

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0]);
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// ---------------------------------------------------------------------
// Registro
// ---------------------------------------------------------------------

const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Escribe tu nombre").max(120, "El nombre es demasiado largo"),
  email: emailSchema,
  password: passwordSchema,
  terms: z.literal("on", { errorMap: () => ({ message: "Necesitas aceptar los términos para crear tu cuenta" }) }),
  siguiente: z.string().optional(),
});

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { fullName: raw.fullName ?? "", email: raw.email ?? "" };
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const result = await createUser(parsed.data);
  if (!result.ok) {
    return {
      fieldErrors: { email: "Ya existe una cuenta con este correo. Ingresa o recupera tu contraseña." },
      values,
    };
  }

  const mail = welcomeEmail(parsed.data.fullName, appUrl(`/verificar?token=${result.verifyToken}`));
  await sendEmail({ to: parsed.data.email, ...mail });
  await startSession(result.id, result.sessionVersion);
  redirect(safeRedirect(parsed.data.siguiente, "/cuenta?aviso=bienvenida"));
}

// ---------------------------------------------------------------------
// Ingresar
// ---------------------------------------------------------------------

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Escribe tu contraseña").max(128),
  siguiente: z.string().optional(),
});

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = { email: raw.email ?? "" };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const result = await authenticate(parsed.data.email, parsed.data.password, clientIp());
  if (!result.ok) {
    const message = {
      invalid: "El correo o la contraseña no coinciden.",
      locked: "Demasiados intentos fallidos. Espera 15 minutos o restablece tu contraseña.",
      suspended: "Esta cuenta está suspendida. Escríbenos para revisarla.",
    }[result.reason];
    return { error: message, values };
  }

  await startSession(result.id, result.sessionVersion);
  redirect(safeRedirect(parsed.data.siguiente));
}

// ---------------------------------------------------------------------
// Cerrar sesión
// ---------------------------------------------------------------------

export async function logoutAction(): Promise<void> {
  endSession();
  redirect("/");
}

// ---------------------------------------------------------------------
// Recuperar contraseña
// ---------------------------------------------------------------------

const RESET_SENT = "Si hay una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. Revisa también tu carpeta de spam.";

export async function requestResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { fieldErrors: { email: parsed.error.issues[0].message }, values: { email: String(formData.get("email") ?? "") } };
  }
  const token = await createPasswordReset(parsed.data);
  if (token) await sendEmail({ to: parsed.data, ...resetEmail(appUrl(`/restablecer?token=${token}`)) });
  // Misma respuesta exista o no la cuenta.
  return { success: RESET_SENT };
}

const resetSchema = z
  .object({
    token: z.string().min(20),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "Las contraseñas no coinciden", path: ["confirm"] });

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const result = await resetPassword(parsed.data.token, parsed.data.password);
  if (!result.ok) return { error: "El enlace venció o ya se usó. Pide uno nuevo." };

  await sendEmail({ to: result.email, ...passwordChangedEmail() });
  await startSession(result.id, result.sessionVersion);
  redirect("/cuenta?aviso=contrasena-restablecida");
}
