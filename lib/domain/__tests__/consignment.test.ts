import { describe, expect, it } from "vitest";
import { holdStatus, withdrawalBlockers } from "../consignment";

const received = new Date("2026-11-01T12:00:00-06:00");
const days = (n: number) => new Date(received.getTime() + n * 24 * 60 * 60 * 1000);

describe("permanencia mínima de 30 días", () => {
  it("no permite retirar antes del día 30", () => {
    const s = holdStatus(received, 30, days(29));
    expect(s.canWithdraw).toBe(false);
    expect(s.daysRemaining).toBe(1);
  });
  it("permite retirar exactamente al cumplir 30 días", () => {
    expect(holdStatus(received, 30, days(30)).canWithdraw).toBe(true);
  });
  it("sigue permitiendo retirar después del mes (la pieza puede quedarse indefinidamente)", () => {
    const s = holdStatus(received, 30, days(200));
    expect(s.canWithdraw).toBe(true);
    expect(s.daysRemaining).toBe(0);
  });
  it("redondea hacia arriba los días que faltan", () => {
    expect(holdStatus(received, 30, days(0.5)).daysRemaining).toBe(30);
  });
  it("rechaza una permanencia inválida", () => {
    expect(() => holdStatus(received, -1)).toThrow();
  });
});

describe("bloqueos para pedir el retiro", () => {
  const base = { status: "publicada", receivedAt: received, minHoldDays: 30, hasOpenRequest: false };
  it("sin bloqueos después del mes con la pieza publicada", () => {
    expect(withdrawalBlockers({ ...base, now: days(31) })).toEqual([]);
  });
  it("bloquea antes del mes e indica cuántos días faltan", () => {
    expect(withdrawalBlockers({ ...base, now: days(20) })).toEqual(["Faltan 10 días de permanencia mínima"]);
  });
  it("bloquea si la pieza está reservada o vendida", () => {
    expect(withdrawalBlockers({ ...base, status: "reservada", now: days(40) })).toHaveLength(1);
  });
  it("bloquea si ya hay una solicitud abierta", () => {
    expect(withdrawalBlockers({ ...base, hasOpenRequest: true, now: days(40) })).toHaveLength(1);
  });
});
