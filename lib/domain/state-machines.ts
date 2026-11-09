/**
 * Máquinas de estado de la plataforma. Esta es la fuente de verdad:
 * la migración SQL replica las transiciones de pieza en `product_status_transitions`
 * y una prueba automatizada verifica que ambas coincidan.
 */

export const PRODUCT_STATUSES = [
  "solicitud_borrador",
  "solicitud_enviada",
  "requiere_informacion",
  "preaprobada",
  "rechazada",
  "pendiente_de_entrega",
  "recibida",
  "en_autenticacion",
  "autenticacion_fallida",
  "pendiente_de_contrato",
  "pendiente_de_fotografia",
  "publicada",
  "reservada",
  "vendida",
  "entregada",
  "en_ventana_de_aceptacion",
  "cerrada",
  "retirada_por_vendedor",
  "devolucion_pendiente",
  "devuelta_al_vendedor",
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_TRANSITIONS: Record<ProductStatus, readonly ProductStatus[]> = {
  solicitud_borrador: ["solicitud_enviada", "retirada_por_vendedor"],
  solicitud_enviada: ["requiere_informacion", "preaprobada", "rechazada"],
  requiere_informacion: ["solicitud_enviada", "retirada_por_vendedor"],
  preaprobada: ["pendiente_de_entrega", "retirada_por_vendedor"],
  rechazada: [],
  pendiente_de_entrega: ["recibida", "retirada_por_vendedor"],
  recibida: ["en_autenticacion"],
  en_autenticacion: ["pendiente_de_contrato", "autenticacion_fallida"],
  autenticacion_fallida: ["devolucion_pendiente"],
  pendiente_de_contrato: ["pendiente_de_fotografia", "devolucion_pendiente"],
  pendiente_de_fotografia: ["publicada"],
  publicada: ["reservada", "devolucion_pendiente"],
  reservada: ["publicada", "vendida"],
  vendida: ["entregada", "publicada"],
  entregada: ["en_ventana_de_aceptacion"],
  en_ventana_de_aceptacion: ["cerrada", "recibida"],
  cerrada: [],
  retirada_por_vendedor: [],
  devolucion_pendiente: ["devuelta_al_vendedor"],
  devuelta_al_vendedor: [],
};

/** Estados en que la pieza es visible en el catálogo público. */
export const PUBLIC_PRODUCT_STATUSES: readonly ProductStatus[] = [
  "publicada",
  "reservada",
  "vendida",
  "entregada",
  "en_ventana_de_aceptacion",
  "cerrada",
];

/** Estados en que la pieza se puede comprar. */
export const PURCHASABLE_STATUSES: readonly ProductStatus[] = ["publicada"];

export const MONEY_STATUSES = [
  "pendiente",
  "cobrado",
  "retenido",
  "en_disputa",
  "disponible",
  "en_lote_de_pago",
  "liquidado",
  "reembolsado",
] as const;
export type MoneyStatus = (typeof MONEY_STATUSES)[number];

export const MONEY_TRANSITIONS: Record<MoneyStatus, readonly MoneyStatus[]> = {
  pendiente: ["cobrado"],
  cobrado: ["retenido", "reembolsado"],
  retenido: ["disponible", "en_disputa", "reembolsado"],
  en_disputa: ["disponible", "reembolsado"],
  disponible: ["en_lote_de_pago"],
  en_lote_de_pago: ["liquidado", "disponible"],
  liquidado: [],
  reembolsado: [],
};

export const ORDER_STATUSES = [
  "pendiente_pago",
  "pagado",
  "en_preparacion",
  "en_camino",
  "entregado",
  "en_ventana_aceptacion",
  "en_disputa",
  "cerrado",
  "cancelado",
  "reembolsado",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pendiente_pago: ["pagado", "cancelado"],
  pagado: ["en_preparacion", "reembolsado"],
  en_preparacion: ["en_camino", "reembolsado"],
  en_camino: ["entregado", "en_preparacion"],
  entregado: ["en_ventana_aceptacion"],
  en_ventana_aceptacion: ["cerrado", "en_disputa"],
  en_disputa: ["cerrado", "reembolsado"],
  cerrado: [],
  cancelado: [],
  reembolsado: [],
};

export function canTransition<S extends string>(
  machine: Record<S, readonly S[]>,
  from: S,
  to: S,
): boolean {
  return machine[from]?.includes(to) ?? false;
}

export class InvalidTransitionError extends Error {
  constructor(entity: string, from: string, to: string) {
    super(`Transición inválida de ${entity}: ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition<S extends string>(
  entity: string,
  machine: Record<S, readonly S[]>,
  from: S,
  to: S,
): void {
  if (!canTransition(machine, from, to)) throw new InvalidTransitionError(entity, from, to);
}

export interface PublishChecks {
  authenticationResult: "autentica" | "no_autentica" | "no_concluyente" | null;
  agreementAccepted: boolean;
  finalImageCount: number;
  finalConditionScore: number | null;
}

/** Regla de oro: sin autenticación física aprobada, contrato firmado y fotos finales, no se publica. */
export function publishBlockers(c: PublishChecks): string[] {
  const blockers: string[] = [];
  if (c.authenticationResult !== "autentica") blockers.push("La pieza no tiene autenticación física aprobada");
  if (!c.agreementAccepted) blockers.push("El vendedor no ha aceptado el contrato de consignación");
  if (c.finalImageCount < 1) blockers.push("Faltan las fotografías finales de la empresa");
  if (c.finalConditionScore === null) blockers.push("Falta la calificación de condición confirmada por persona");
  return blockers;
}
