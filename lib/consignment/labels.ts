import type { ProductStatus } from "@/lib/domain/state-machines";

/** Cómo ve el vendedor cada estado de su pieza, y qué sigue. */
export const SELLER_STATUS: Partial<Record<ProductStatus, { label: string; next: string }>> = {
  solicitud_borrador: { label: "Borrador", next: "Completa las fotos y envía tu solicitud." },
  solicitud_enviada: { label: "En revisión", next: "Estamos revisando tus fotos. Te respondemos por correo." },
  requiere_informacion: { label: "Falta información", next: "Revisa lo que te pedimos, actualiza y vuelve a enviar." },
  preaprobada: { label: "Propuesta lista", next: "Acepta, contrapropón o retira tu solicitud." },
  rechazada: { label: "No aceptada", next: "Esta pieza no se puede consignar." },
  pendiente_de_entrega: { label: "Por entregar", next: "Te contactamos para agendar la entrega o recolección." },
  recibida: { label: "Recibida", next: "Ya la tenemos; sigue la autenticación física." },
  en_autenticacion: { label: "En autenticación", next: "Estamos revisando la pieza en persona." },
  autenticacion_fallida: { label: "No pasó la autenticación", next: "Te la devolvemos según el contrato." },
  pendiente_de_contrato: { label: "Contrato pendiente", next: "Revisa y acepta tu contrato de consignación." },
  pendiente_de_fotografia: { label: "En fotografía", next: "Estamos preparando las fotos de la publicación." },
  publicada: { label: "Publicada", next: "Tu pieza ya está a la venta." },
  reservada: { label: "Reservada", next: "Alguien está pagando tu pieza." },
  vendida: { label: "Vendida", next: "La estamos entregando al comprador." },
  entregada: { label: "Entregada", next: "El comprador tiene 72 horas para revisarla." },
  en_ventana_de_aceptacion: { label: "En revisión del comprador", next: "Al terminar las 72 horas te pagamos." },
  cerrada: { label: "Vendida y pagada", next: "Venta terminada." },
  devolucion_pendiente: { label: "Devolución pendiente", next: "Coordinamos contigo para regresarte la pieza." },
  devuelta_al_vendedor: { label: "Devuelta", next: "La pieza volvió contigo." },
  retirada_por_vendedor: { label: "Retirada", next: "Retiraste esta solicitud." },
};

export function sellerStatus(status: ProductStatus) {
  return SELLER_STATUS[status] ?? { label: status, next: "" };
}
