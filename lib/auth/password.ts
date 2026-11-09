import bcrypt from "bcryptjs";
import { z } from "zod";

const COST = 12;

export const passwordSchema = z
  .string()
  .min(10, "La contraseña debe tener al menos 10 caracteres")
  .max(128, "La contraseña es demasiado larga")
  .refine((p) => /[a-zA-ZñÑ]/.test(p) && /\d/.test(p), "Usa letras y al menos un número");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "El correo es demasiado largo")
  .email("Escribe un correo válido");

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Hash válido que nunca coincide; se compara contra él cuando el correo no existe para no revelar cuentas por tiempo de respuesta. */
export const DUMMY_HASH = "$2b$12$nWhUYWk/UpFKb6AYO5nmbOwSclhCrfXfmK6bnpNhjotCDvgc92u3i";
