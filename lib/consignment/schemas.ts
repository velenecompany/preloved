import { z } from "zod";
import { pesosToCents } from "@/lib/domain/money";

export const DECLARED_CONDITIONS = ["nuevo_con_etiquetas", "nuevo_sin_etiquetas", "excelente", "muy_bueno", "bueno", "aceptable"] as const;
export const INCLUDED_ITEMS = [
  "full_set",
  "solo_par",
  "solo_prenda",
  "solo_caja",
  "caja_y_accesorios",
  "ticket_departamental",
  "ticket_boutique",
  "certificado_autenticidad",
  "otros_accesorios",
] as const;
export const SIZE_SYSTEMS = ["MX", "US", "UK", "EU", "UNICA"] as const;
export const FITS = ["normal", "amplio", "reducido"] as const;

const nullToEmpty = (v: unknown) => v ?? "";
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const priceSchema = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.coerce
    .number({ required_error: "Escribe el precio en pesos", invalid_type_error: "Escribe el precio en pesos" })
    .min(500, "El precio mínimo es $500")
    .max(5_000_000, "Para piezas de más de $5,000,000 escríbenos directo")
    .transform((pesos) => pesosToCents(Math.round(pesos))),
);

const brandSchema = z
  .object({
    slug: z.preprocess(emptyToNull, z.string().regex(/^[a-z0-9-]+$/).nullable()),
    name: z.preprocess(emptyToNull, z.string().trim().max(60, "Nombre de marca demasiado largo").nullable()),
  })
  .refine((b) => b.slug || (b.name && b.name.length >= 2), "Elige la marca o escríbela");

export const draftSchema = z
  .object({
    categorySlug: z.preprocess(nullToEmpty, z.string().regex(/^[a-z0-9-]+$/, "Elige una categoría")),
    brand: brandSchema,
    model: z.preprocess(nullToEmpty, z.string().trim().min(2, "Escribe el modelo o nombre de la pieza").max(120)),
    sizeLabel: z.preprocess(emptyToNull, z.string().trim().max(12, "Talla demasiado larga").nullable()),
    sizeSystem: z.preprocess(emptyToNull, z.enum(SIZE_SYSTEMS).nullable()),
    fit: z.preprocess(emptyToNull, z.enum(FITS).nullable()),
    declaredCondition: z.enum(DECLARED_CONDITIONS, { errorMap: () => ({ message: "Elige la condición" }) }),
    includes: z.array(z.enum(INCLUDED_ITEMS)).max(INCLUDED_ITEMS.length),
    description: z.preprocess(emptyToNull, z.string().trim().max(1500, "Máximo 1,500 caracteres").nullable()),
    askingPriceCents: priceSchema,
  })
  .transform(({ brand, ...rest }) => ({ ...rest, brandSlug: brand.slug, brandName: brand.slug ? null : brand.name }));

export function readDraftForm(formData: FormData) {
  return {
    categorySlug: formData.get("categorySlug"),
    brand: {
      slug: formData.get("brandSlug") === "otra" ? null : formData.get("brandSlug"),
      name: formData.get("brandSlug") === "otra" ? formData.get("brandName") : null,
    },
    model: formData.get("model"),
    sizeLabel: formData.get("sizeLabel"),
    sizeSystem: formData.get("sizeSystem"),
    fit: formData.get("fit"),
    declaredCondition: formData.get("declaredCondition"),
    includes: formData.getAll("includes"),
    description: formData.get("description"),
    askingPriceCents: String(formData.get("askingPrice") ?? "").replace(/[$,\s]/g, ""),
  };
}
