import { describe, expect, it } from "vitest";
import { computeCommission, findRule, validateRuleSet, type CommissionRule } from "../commissions";
import { applyBps, pesosToCents } from "../money";

const RULES: CommissionRule[] = [
  { id: "l1", group: "lujo", minPriceCents: 0, maxPriceCents: 1_100_000, rateBps: 3000, minFeeCents: 0 },
  { id: "l2", group: "lujo", minPriceCents: 1_100_000, maxPriceCents: 6_000_000, rateBps: 2000, minFeeCents: 0 },
  { id: "l3", group: "lujo", minPriceCents: 6_000_000, maxPriceCents: null, rateBps: 1500, minFeeCents: 0 },
  { id: "s1", group: "sneakers_streetwear", minPriceCents: 0, maxPriceCents: 1_100_000, rateBps: 1800, minFeeCents: 0 },
  { id: "s2", group: "sneakers_streetwear", minPriceCents: 1_100_000, maxPriceCents: 6_000_000, rateBps: 1500, minFeeCents: 0 },
  { id: "s3", group: "sneakers_streetwear", minPriceCents: 6_000_000, maxPriceCents: null, rateBps: 1200, minFeeCents: 0 },
];

const commissionFor = (group: string, pesos: number) => {
  const price = pesosToCents(pesos);
  return computeCommission(price, findRule(RULES, group, price));
};

describe("límites exactos de los rangos", () => {
  it.each([
    [10_999, "l1"],
    [10_999.99, "l1"],
    [11_000, "l2"],
    [59_999, "l2"],
    [59_999.99, "l2"],
    [60_000, "l3"],
    [1, "l1"],
    [5_000_000, "l3"],
  ])("$%s MXN usa la regla %s", (pesos, ruleId) => {
    expect(findRule(RULES, "lujo", pesosToCents(pesos)).id).toBe(ruleId);
  });
});

describe("ejemplos del prompt maestro", () => {
  it("bolso de $8,000 → $2,400 comisión, $5,600 vendedor", () => {
    const r = commissionFor("lujo", 8_000);
    expect(r.commissionCents).toBe(240_000);
    expect(r.sellerGrossCents).toBe(560_000);
  });
  it("$25,000 → $5,000 comisión, $20,000 vendedor", () => {
    const r = commissionFor("lujo", 25_000);
    expect(r.commissionCents).toBe(500_000);
    expect(r.sellerGrossCents).toBe(2_000_000);
  });
  it("$80,000 → $12,000 comisión, $68,000 vendedor", () => {
    const r = commissionFor("lujo", 80_000);
    expect(r.commissionCents).toBe(1_200_000);
    expect(r.sellerGrossCents).toBe(6_800_000);
  });
  it("sneakers de $6,000 → 18%", () => {
    expect(commissionFor("sneakers_streetwear", 6_000).commissionCents).toBe(108_000);
  });
});

describe("cálculo", () => {
  it("la comisión más el neto siempre suman el precio", () => {
    for (let cents = 1; cents < 50_000_000; cents += 7_919) {
      const r = computeCommission(cents, findRule(RULES, "lujo", cents));
      expect(r.commissionCents + r.sellerGrossCents).toBe(cents);
      expect(Number.isInteger(r.commissionCents)).toBe(true);
    }
  });
  it("aplica la comisión mínima sin exceder el precio", () => {
    const frozen = { id: "x", rateBps: 3000, minFeeCents: 40_000 };
    expect(computeCommission(100_000, frozen).commissionCents).toBe(40_000);
    expect(computeCommission(30_000, frozen).commissionCents).toBe(30_000);
  });
  it("redondea a la mitad hacia arriba", () => {
    expect(applyBps(5, 1000)).toBe(1); // 0.5 → 1
    expect(applyBps(4, 1000)).toBe(0); // 0.4 → 0
  });
  it("rechaza montos con decimales o precio cero", () => {
    expect(() => computeCommission(100.5, { id: "x", rateBps: 3000, minFeeCents: 0 })).toThrow();
    expect(() => findRule(RULES, "lujo", 0)).toThrow();
  });
  it("falla si no hay regla para el grupo", () => {
    expect(() => findRule(RULES, "relojes", 100_000)).toThrow();
  });
});

describe("validación de reglas desde el panel", () => {
  it("las reglas iniciales son válidas", () => {
    expect(validateRuleSet(RULES)).toEqual([]);
  });
  it("detecta huecos, traslapes y último rango cerrado", () => {
    const bad: CommissionRule[] = [
      { id: "a", group: "g", minPriceCents: 100, maxPriceCents: 1_000, rateBps: 3000, minFeeCents: 0 },
      { id: "b", group: "g", minPriceCents: 900, maxPriceCents: 2_000, rateBps: 2000, minFeeCents: 0 },
      { id: "c", group: "g", minPriceCents: 2_500, maxPriceCents: 3_000, rateBps: 1500, minFeeCents: 0 },
    ];
    const errors = validateRuleSet(bad);
    expect(errors.some((e) => e.includes("iniciar en $0"))).toBe(true);
    expect(errors.some((e) => e.includes("traslapados"))).toBe(true);
    expect(errors.some((e) => e.includes("hueco"))).toBe(true);
    expect(errors.some((e) => e.includes("abierto"))).toBe(true);
  });
});
