export const DECLARED_CONDITION_LABEL: Record<string, string> = {
  nuevo_con_etiquetas: "Nuevo con etiquetas",
  nuevo_sin_etiquetas: "Nuevo sin etiquetas",
  excelente: "Excelente",
  muy_bueno: "Muy bueno",
  bueno: "Bueno",
  aceptable: "Aceptable",
};

export const INCLUDED_ITEM_LABEL: Record<string, string> = {
  full_set: "Full set",
  solo_par: "Solo par",
  solo_prenda: "Solo prenda",
  solo_caja: "Solo caja",
  caja_y_accesorios: "Caja y accesorios",
  ticket_departamental: "Ticket de tienda departamental",
  ticket_boutique: "Ticket de boutique oficial",
  certificado_autenticidad: "Certificado de autenticidad",
  otros_accesorios: "Otros accesorios",
};

export const FIT_LABEL: Record<string, string> = {
  normal: "Talla normal",
  amplio: "Talla amplia",
  reducido: "Talla reducida",
};

export const CONDITION_SCALE: Record<number, string> = {
  10: "Nuevo, sin señales visibles de uso",
  9: "Prácticamente nuevo, detalles mínimos",
  8: "Excelente, desgaste casi imperceptible",
  7: "Muy buena, desgaste ligero",
  6: "Buena, señales visibles de uso",
  5: "Aceptable, desgaste moderado",
  4: "Desgaste considerable",
  3: "Daños o defectos importantes",
  2: "Condición deficiente",
  1: "Muy deteriorado",
};

export function conditionScaleLabel(score: number): string {
  return CONDITION_SCALE[Math.floor(score)] ?? "";
}

export function formatScore(score: number): string {
  return Number.isInteger(score) ? `${score}` : score.toFixed(1);
}

const dateFormatter = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" });
export const formatDate = (value: string | Date) => dateFormatter.format(new Date(value));
