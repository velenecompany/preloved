/**
 * Reglas puras de la Fase 3B: horarios de entrega, SKU, slug público y checklist de autenticación.
 * Sin base de datos para poder probarlas con datos fijos.
 */

// ---------------------------------------------------------------------
// Horarios (Guadalajara: UTC-6 todo el año, sin horario de verano desde 2022)
// ---------------------------------------------------------------------

const TZ_OFFSET_HOURS = -6;

export type IntakeMethod = "sucursal" | "recoleccion" | "paqueteria";
export const INTAKE_METHODS: IntakeMethod[] = ["sucursal", "recoleccion", "paqueteria"];

export interface IntakeOptions {
  sucursal: { enabled: boolean; address: string; days: number[]; from_hour: number; to_hour: number; slot_minutes: number };
  recoleccion: { enabled: boolean; fee_cents: number; postal_prefixes: string[]; municipalities: string[]; days: number[]; windows: [number, number][] };
  paqueteria: { enabled: boolean; address: string; notes: string };
  min_lead_hours: number;
  horizon_days: number;
}

export const DEFAULT_INTAKE_OPTIONS: IntakeOptions = {
  sucursal: { enabled: true, address: "Dirección por confirmar, Guadalajara, Jal.", days: [1, 2, 3, 4, 5, 6], from_hour: 11, to_hour: 19, slot_minutes: 60 },
  recoleccion: {
    enabled: true,
    fee_cents: 0,
    postal_prefixes: ["44", "45"],
    municipalities: ["Guadalajara", "Zapopan", "San Pedro Tlaquepaque", "Tonalá", "Tlajomulco de Zúñiga", "El Salto"],
    days: [1, 2, 3, 4, 5],
    windows: [
      [10, 14],
      [15, 19],
    ],
  },
  paqueteria: { enabled: true, address: "Dirección por confirmar, Guadalajara, Jal.", notes: "" },
  min_lead_hours: 18,
  horizon_days: 14,
};

/** Combina lo guardado en la base con los valores por defecto, para que un campo faltante no rompa la página. */
export function normalizeIntakeOptions(raw: unknown): IntakeOptions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<IntakeOptions>;
  const d = DEFAULT_INTAKE_OPTIONS;
  return {
    sucursal: { ...d.sucursal, ...(r.sucursal ?? {}) },
    recoleccion: { ...d.recoleccion, ...(r.recoleccion ?? {}) },
    paqueteria: { ...d.paqueteria, ...(r.paqueteria ?? {}) },
    min_lead_hours: r.min_lead_hours ?? d.min_lead_hours,
    horizon_days: r.horizon_days ?? d.horizon_days,
  };
}

/** Instante UTC de una hora local de Guadalajara. */
function localToUtc(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month, day, hour - TZ_OFFSET_HOURS, minute));
}

/** Fecha local (año, mes, día, día de la semana) de un instante. */
function localParts(d: Date) {
  const shifted = new Date(d.getTime() + TZ_OFFSET_HOURS * 3_600_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth(), day: shifted.getUTCDate(), weekday: shifted.getUTCDay(), hour: shifted.getUTCHours() };
}

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const hh = (h: number, m = 0) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

export function formatLocalDay(d: Date): string {
  const p = localParts(d);
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month]}`;
}

export function formatLocalDateTime(d: Date): string {
  const shifted = new Date(d.getTime() + TZ_OFFSET_HOURS * 3_600_000);
  return `${formatLocalDay(d)}, ${hh(shifted.getUTCHours(), shifted.getUTCMinutes())}`;
}

export interface Slot {
  /** Instante de inicio en ISO (UTC). Es lo que se guarda. */
  value: string;
  label: string;
  day: string;
}

/** Horarios disponibles para agendar, desde `now` + anticipación mínima hasta el horizonte. */
export function availableSlots(options: IntakeOptions, method: "sucursal" | "recoleccion", now: Date): Slot[] {
  const earliest = now.getTime() + options.min_lead_hours * 3_600_000;
  const today = localParts(now);
  const slots: Slot[] = [];
  for (let i = 0; i <= options.horizon_days; i++) {
    const base = localToUtc(today.year, today.month, today.day + i, 12);
    const p = localParts(base);
    if (method === "sucursal") {
      const o = options.sucursal;
      if (!o.days.includes(p.weekday)) continue;
      for (let m = o.from_hour * 60; m + o.slot_minutes <= o.to_hour * 60; m += o.slot_minutes) {
        const start = localToUtc(p.year, p.month, p.day, 0, m);
        if (start.getTime() < earliest) continue;
        slots.push({ value: start.toISOString(), label: hh(Math.floor(m / 60), m % 60), day: formatLocalDay(start) });
      }
    } else {
      const o = options.recoleccion;
      if (!o.days.includes(p.weekday)) continue;
      for (const [from, to] of o.windows) {
        const start = localToUtc(p.year, p.month, p.day, from);
        if (start.getTime() < earliest) continue;
        slots.push({ value: start.toISOString(), label: `${hh(from)} a ${hh(to)}`, day: formatLocalDay(start) });
      }
    }
  }
  return slots;
}

export function isAvailableSlot(options: IntakeOptions, method: "sucursal" | "recoleccion", iso: string, now: Date): boolean {
  return availableSlots(options, method, now).some((s) => s.value === iso);
}

/** Etiqueta legible de un horario ya guardado (con la ventana completa en recolección). */
export function describeSlot(options: IntakeOptions, method: IntakeMethod, at: Date): string {
  if (method === "recoleccion") {
    const startHour = localParts(at).hour;
    const w = options.recoleccion.windows.find(([from]) => from === startHour);
    return w ? `${formatLocalDay(at)}, de ${hh(w[0])} a ${hh(w[1])}` : formatLocalDateTime(at);
  }
  return formatLocalDateTime(at);
}

export function pickupCovers(options: IntakeOptions, postalCode: string): boolean {
  return /^\d{5}$/.test(postalCode) && options.recoleccion.postal_prefixes.some((p) => postalCode.startsWith(p));
}

// ---------------------------------------------------------------------
// SKU y slug público
// ---------------------------------------------------------------------

export function formatSku(seq: number, at: Date): string {
  const yy = String(localParts(at).year % 100).padStart(2, "0");
  return `R${yy}-${String(seq).padStart(5, "0")}`;
}

export function productSlug(brand: string, model: string, sku: string): string {
  const base = `${brand} ${model}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70)
    .replace(/-$/, "");
  return `${base}-${sku.toLowerCase()}`;
}

// ---------------------------------------------------------------------
// Checklist de autenticación física
// ---------------------------------------------------------------------

export interface ChecklistItem {
  id: string;
  label: string;
}

const COMMON_CHECKS: ChecklistItem[] = [
  { id: "coincide_fotos", label: "Es la misma pieza de las fotos de la solicitud" },
  { id: "etiquetas", label: "Etiquetas: tipografía, costura y contenido correctos" },
  { id: "codigos", label: "Códigos de serie, fecha o estilo coherentes con el modelo" },
  { id: "materiales", label: "Materiales y textura correctos al tacto" },
  { id: "costuras", label: "Costuras: puntadas parejas, color e hilo correctos" },
  { id: "olor", label: "Sin olor químico ni a pegamento fuera de lo normal" },
];

export const AUTH_CHECKLISTS: Record<"calzado" | "bolsos" | "general", ChecklistItem[]> = {
  calzado: [
    ...COMMON_CHECKS,
    { id: "suela", label: "Suela: patrón, dureza y marcas correctos" },
    { id: "plantilla", label: "Plantilla e impresión interior correctas" },
    { id: "forma", label: "Silueta y proporciones del modelo" },
    { id: "caja", label: "Caja y etiqueta de caja coinciden con el par (si la incluye)" },
  ],
  bolsos: [
    ...COMMON_CHECKS,
    { id: "herrajes", label: "Herrajes: peso, grabado y acabado correctos" },
    { id: "cierres", label: "Cierres con la marca y el modelo de jalador correctos" },
    { id: "forro", label: "Forro: material, color y estampado correctos" },
    { id: "sello_calor", label: "Sello de calor o placa con tipografía correcta" },
  ],
  general: [
    ...COMMON_CHECKS,
    { id: "estampados", label: "Estampados, bordados y logotipos nítidos y bien ubicados" },
    { id: "botones", label: "Botones, broches y cierres con la marca correcta" },
  ],
};

export function checklistFor(categorySlug: string): ChecklistItem[] {
  if (categorySlug === "sneakers") return AUTH_CHECKLISTS.calzado;
  if (categorySlug === "designer-bags") return AUTH_CHECKLISTS.bolsos;
  return AUTH_CHECKLISTS.general;
}

export type CheckAnswer = "ok" | "falla" | "na";
export type AuthResult = "autentica" | "no_autentica" | "no_concluyente";

/** Valida que el resultado sea coherente con lo marcado. Devuelve el primer problema o null. */
export function checklistProblem(items: ChecklistItem[], answers: Record<string, CheckAnswer | undefined>, result: AuthResult): string | null {
  const missing = items.filter((i) => !answers[i.id]);
  if (result !== "no_concluyente" && missing.length) return `Falta revisar: ${missing[0].label}`;
  const failures = items.filter((i) => answers[i.id] === "falla");
  if (result === "autentica" && failures.length) return `No puede ser auténtica con un punto que falla: ${failures[0].label}`;
  if (result === "autentica" && answers.coincide_fotos !== "ok") return "Confirma que es la misma pieza de las fotos de la solicitud";
  if (result === "no_autentica" && failures.length === 0) return "Marca qué punto falla";
  return null;
}

const MONTHS_LONG = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "10 de diciembre de 2026", en hora de Guadalajara. */
export function formatLongDate(d: Date): string {
  const p = localParts(d);
  return `${p.day} de ${MONTHS_LONG[p.month]} de ${p.year}`;
}

export const INTAKE_METHOD_LABEL: Record<IntakeMethod, string> = {
  sucursal: "Cita en punto fijo",
  recoleccion: "Recolección a domicilio",
  paqueteria: "Paquetería",
};
