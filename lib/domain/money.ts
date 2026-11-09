/**
 * Todos los montos de la plataforma se manejan como centavos enteros (MXN).
 * Nunca usar números con decimales para dinero.
 */
export type Cents = number;

export function assertCents(value: number, label = "monto"): asserts value is Cents {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} debe ser un entero de centavos, se recibió ${value}`);
  }
}

export function pesosToCents(pesos: number): Cents {
  const cents = Math.round(pesos * 100);
  assertCents(cents);
  return cents;
}

/** Multiplica un monto por una tasa en puntos base (1 bps = 0.01 %), redondeando a la mitad hacia arriba. */
export function applyBps(amount: Cents, bps: number): Cents {
  assertCents(amount);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new Error(`Tasa inválida en puntos base: ${bps}`);
  }
  const product = amount * bps;
  return Math.floor((product + 5_000) / 10_000);
}

const formatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatMXN(cents: Cents): string {
  return formatter.format(cents / 100);
}
