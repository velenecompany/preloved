import { applyBps, assertCents, type Cents } from "./money";

/**
 * Regla de comisión por grupo de categoría y rango de precio.
 * El rango es [minPriceCents, maxPriceCents) — el máximo es exclusivo; null = sin límite.
 * Ejemplo: "Hasta $10,999" = [0, 1_100_000) para que $10,999.50 siga en el primer rango.
 */
export interface CommissionRule {
  id: string;
  group: string;
  minPriceCents: Cents;
  maxPriceCents: Cents | null;
  rateBps: number;
  minFeeCents: Cents;
}

export interface CommissionBreakdown {
  ruleId: string;
  salePriceCents: Cents;
  rateBps: number;
  minFeeCents: Cents;
  commissionCents: Cents;
  sellerGrossCents: Cents;
}

export function findRule(rules: CommissionRule[], group: string, priceCents: Cents): CommissionRule {
  assertCents(priceCents, "precio");
  if (priceCents <= 0) throw new Error("El precio debe ser mayor a cero");
  const match = rules.find(
    (r) =>
      r.group === group &&
      priceCents >= r.minPriceCents &&
      (r.maxPriceCents === null || priceCents < r.maxPriceCents),
  );
  if (!match) throw new Error(`No hay regla de comisión para el grupo "${group}" y precio ${priceCents}`);
  return match;
}

/** Calcula la comisión con una regla ya congelada (la del contrato), sin volver a buscar en las reglas vigentes. */
export function computeCommission(
  salePriceCents: Cents,
  frozen: Pick<CommissionRule, "id" | "rateBps" | "minFeeCents">,
): CommissionBreakdown {
  assertCents(salePriceCents, "precio de venta");
  assertCents(frozen.minFeeCents, "comisión mínima");
  if (salePriceCents <= 0) throw new Error("El precio de venta debe ser mayor a cero");
  const byRate = applyBps(salePriceCents, frozen.rateBps);
  const commissionCents = Math.min(Math.max(byRate, frozen.minFeeCents), salePriceCents);
  return {
    ruleId: frozen.id,
    salePriceCents,
    rateBps: frozen.rateBps,
    minFeeCents: frozen.minFeeCents,
    commissionCents,
    sellerGrossCents: salePriceCents - commissionCents,
  };
}

/**
 * Valida que las reglas de cada grupo cubran desde $0 sin huecos ni traslapes
 * y que el último rango sea abierto. Se usa antes de guardar cambios desde el panel.
 */
export function validateRuleSet(rules: CommissionRule[]): string[] {
  const errors: string[] = [];
  const groups = new Map<string, CommissionRule[]>();
  for (const r of rules) {
    if (!Number.isInteger(r.rateBps) || r.rateBps < 0 || r.rateBps > 10_000) {
      errors.push(`Regla ${r.id}: porcentaje fuera de rango`);
    }
    if (r.maxPriceCents !== null && r.maxPriceCents <= r.minPriceCents) {
      errors.push(`Regla ${r.id}: el máximo debe ser mayor que el mínimo`);
    }
    groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  }
  for (const [group, list] of groups) {
    const sorted = [...list].sort((a, b) => a.minPriceCents - b.minPriceCents);
    if (sorted[0].minPriceCents !== 0) errors.push(`Grupo ${group}: el primer rango debe iniciar en $0`);
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      if (cur.maxPriceCents === null) {
        errors.push(`Grupo ${group}: solo el último rango puede no tener máximo`);
      } else if (cur.maxPriceCents < next.minPriceCents) {
        errors.push(`Grupo ${group}: hueco entre ${cur.maxPriceCents} y ${next.minPriceCents}`);
      } else if (cur.maxPriceCents > next.minPriceCents) {
        errors.push(`Grupo ${group}: rangos traslapados en ${next.minPriceCents}`);
      }
    }
    if (sorted[sorted.length - 1].maxPriceCents !== null) {
      errors.push(`Grupo ${group}: el último rango debe quedar abierto`);
    }
  }
  return errors;
}
