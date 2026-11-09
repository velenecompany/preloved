import { describe, expect, it } from "vitest";
import { assertBalanced, fullRefundLines, payoutLines, saleLines, sellerAccount, SYSTEM_ACCOUNTS, type LedgerLine } from "../ledger";
import { computeCommission } from "../commissions";

const sum = (lines: LedgerLine[], side: "debitCents" | "creditCents") => lines.reduce((a, l) => a + l[side], 0);
const commission = computeCommission(800_000, { id: "l1", rateBps: 3000, minFeeCents: 0 });

describe("asiento de venta", () => {
  it("cuadra y separa vendedor, comisión, envío y procesador", () => {
    const lines = saleLines({ sellerId: "s1", commission, shippingCents: 15_000, processorFeeCents: 33_000 });
    expect(sum(lines, "debitCents")).toBe(sum(lines, "creditCents"));
    expect(lines).toContainEqual({ account: sellerAccount("s1"), debitCents: 0, creditCents: 560_000 });
    expect(lines).toContainEqual({ account: SYSTEM_ACCOUNTS.ingresoComision, debitCents: 0, creditCents: 240_000 });
    expect(lines).toContainEqual({ account: SYSTEM_ACCOUNTS.ingresoEnvio, debitCents: 0, creditCents: 15_000 });
    expect(lines).toContainEqual({ account: SYSTEM_ACCOUNTS.gastoProcesador, debitCents: 33_000, creditCents: 0 });
  });
  it("no genera líneas en cero cuando no hay envío ni comisión de procesador", () => {
    const lines = saleLines({ sellerId: "s1", commission, shippingCents: 0, processorFeeCents: 0 });
    expect(lines).toHaveLength(3);
  });
});

describe("liquidación", () => {
  it("cuadra con y sin retenciones", () => {
    expect(() => payoutLines({ sellerId: "s1", grossCents: 560_000, withholdingCents: 0 })).not.toThrow();
    const lines = payoutLines({ sellerId: "s1", grossCents: 560_000, withholdingCents: 14_000 });
    expect(lines).toContainEqual({ account: SYSTEM_ACCOUNTS.efectivoBanco, debitCents: 0, creditCents: 546_000 });
  });
  it("rechaza retención mayor al bruto", () => {
    expect(() => payoutLines({ sellerId: "s1", grossCents: 100, withholdingCents: 200 })).toThrow();
  });
});

describe("reembolso", () => {
  it("revierte la venta y cuadra", () => {
    const lines = fullRefundLines({ sellerId: "s1", commission, shippingCents: 15_000 });
    expect(sum(lines, "debitCents")).toBe(815_000);
    expect(sum(lines, "creditCents")).toBe(815_000);
  });
});

describe("assertBalanced", () => {
  it("rechaza asientos descuadrados, líneas dobles o vacías", () => {
    expect(() => assertBalanced([
      { account: "a", debitCents: 100, creditCents: 0 },
      { account: "b", debitCents: 0, creditCents: 99 },
    ])).toThrow(/descuadrado/);
    expect(() => assertBalanced([
      { account: "a", debitCents: 100, creditCents: 100 },
      { account: "b", debitCents: 0, creditCents: 0 },
    ])).toThrow();
    expect(() => assertBalanced([{ account: "a", debitCents: 100, creditCents: 0 }])).toThrow();
  });
});
