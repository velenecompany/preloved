/**
 * Datos de la marca y contacto. Se configuran por variables de entorno públicas
 * para no tocar código cuando se defina el nombre definitivo.
 */
export const site = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME ?? "Segundo Acto",
  city: "Guadalajara",
  description:
    "Consignación de moda de diseñador preloved en Guadalajara. Cada pieza se recibe, se autentica físicamente y se fotografía antes de publicarse.",
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "",
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "",
  instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? "",
};

export function whatsappLink(message: string): string | null {
  const number = site.whatsapp.replace(/\D/g, "");
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
