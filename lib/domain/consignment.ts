/** Reglas de consignación: permanencia mínima y retiro por parte del vendedor. */

export const DEFAULT_MIN_HOLD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface HoldStatus {
  /** Fecha desde la que el vendedor puede pedir el retiro. */
  holdUntil: Date;
  canWithdraw: boolean;
  /** Días completos que faltan (0 si ya puede retirar). */
  daysRemaining: number;
}

export function holdStatus(receivedAt: Date, minHoldDays: number, now: Date = new Date()): HoldStatus {
  if (!Number.isInteger(minHoldDays) || minHoldDays < 0) throw new Error(`Permanencia mínima inválida: ${minHoldDays}`);
  const holdUntil = new Date(receivedAt.getTime() + minHoldDays * DAY_MS);
  const remainingMs = holdUntil.getTime() - now.getTime();
  return {
    holdUntil,
    canWithdraw: remainingMs <= 0,
    daysRemaining: remainingMs <= 0 ? 0 : Math.ceil(remainingMs / DAY_MS),
  };
}

/** Motivos por los que un vendedor no puede pedir el retiro todavía. */
export function withdrawalBlockers(params: {
  status: string;
  receivedAt: Date | null;
  minHoldDays: number;
  hasOpenRequest: boolean;
  now?: Date;
}): string[] {
  const blockers: string[] = [];
  if (params.status !== "publicada") blockers.push("Solo se puede retirar una pieza publicada");
  if (params.hasOpenRequest) blockers.push("Ya hay una solicitud de retiro en curso");
  if (!params.receivedAt) {
    blockers.push("La pieza aún no tiene fecha de recepción");
  } else {
    const hold = holdStatus(params.receivedAt, params.minHoldDays, params.now);
    if (!hold.canWithdraw) {
      blockers.push(`Faltan ${hold.daysRemaining} ${hold.daysRemaining === 1 ? "día" : "días"} de permanencia mínima`);
    }
  }
  return blockers;
}
