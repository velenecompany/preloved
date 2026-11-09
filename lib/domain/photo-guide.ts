/**
 * Guía de fotos de la solicitud de consignación. Cada toma tiene un identificador fijo (slot)
 * para saber qué foto es cuál al revisar y al mandarla a la IA.
 */

export interface PhotoSlot {
  slot: string;
  label: string;
  hint: string;
  required: boolean;
  /** Se permiten varias fotos en esta toma. */
  multiple?: boolean;
}

const COMMON_START: PhotoSlot[] = [
  { slot: "frente", label: "Frente", hint: "La pieza completa, de frente, con buena luz.", required: true },
  { slot: "espalda", label: "Espalda", hint: "La parte de atrás completa.", required: true },
  { slot: "lateral", label: "Laterales", hint: "Ambos lados.", required: false, multiple: true },
  { slot: "etiqueta", label: "Etiquetas interiores", hint: "Marca, talla, composición y códigos, que se lean.", required: true, multiple: true },
];

const COMMON_END: PhotoSlot[] = [
  { slot: "material", label: "Detalle del material", hint: "De cerca: piel, tela, costuras.", required: false, multiple: true },
  { slot: "defectos", label: "Desgaste o defectos", hint: "Cualquier marca, raspón o mancha. Mejor que lo veamos antes.", required: false, multiple: true },
  { slot: "accesorios", label: "Caja, bolsa protectora y tickets", hint: "Todo lo que incluye.", required: false, multiple: true },
];

const BY_GROUP: Record<string, PhotoSlot[]> = {
  calzado: [
    ...COMMON_START,
    { slot: "suela", label: "Suelas", hint: "Ambas suelas, de frente a la cámara.", required: true },
    { slot: "superior", label: "Vista superior", hint: "El par desde arriba.", required: false },
    ...COMMON_END,
  ],
  bolsos: [
    ...COMMON_START,
    { slot: "interior", label: "Interior", hint: "El forro y los bolsillos.", required: true },
    { slot: "herrajes", label: "Herrajes", hint: "Cierres, hebillas y grabados.", required: false, multiple: true },
    { slot: "base", label: "Base y esquinas", hint: "Donde más se nota el uso.", required: false },
    ...COMMON_END,
  ],
  general: [...COMMON_START, ...COMMON_END],
};

/** Slug de categoría → guía. Sneakers usa la de calzado; bolsos la suya; el resto la general. */
export function photoGuideFor(categorySlug: string): PhotoSlot[] {
  if (categorySlug === "sneakers") return BY_GROUP.calzado;
  if (categorySlug === "designer-bags") return BY_GROUP.bolsos;
  return BY_GROUP.general;
}

export const POSSESSION_SLOT = "posesion";

export function missingRequiredSlots(categorySlug: string, uploadedSlots: string[]): PhotoSlot[] {
  const have = new Set(uploadedSlots);
  return photoGuideFor(categorySlug).filter((s) => s.required && !have.has(s.slot));
}

export function isKnownSlot(categorySlug: string, slot: string): boolean {
  return slot === POSSESSION_SLOT || photoGuideFor(categorySlug).some((s) => s.slot === slot);
}

/** Orden de preferencia de las fotos que se mandan a la IA (máximo 5 por solicitud). */
export const AI_SLOT_PRIORITY = ["frente", "espalda", "suela", "defectos", "base", "interior", "lateral", "material", "superior", "herrajes"];

/** Código de prueba de posesión: corto, sin caracteres que se confundan al escribirlos a mano. */
export function newPossessionCode(random: () => number = Math.random): string {
  const alphabet = "ACDEFGHJKMNPQRTUVWXY34679";
  let code = "";
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(random() * alphabet.length)];
  return `RL-${code}`;
}
