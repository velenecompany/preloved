import { describe, expect, it } from "vitest";
import {
  availableSlots,
  checklistFor,
  checklistProblem,
  DEFAULT_INTAKE_OPTIONS,
  describeSlot,
  formatSku,
  isAvailableSlot,
  normalizeIntakeOptions,
  pickupCovers,
  productSlug,
} from "../inventory";

const opts = DEFAULT_INTAKE_OPTIONS;
// Lunes 9 de noviembre de 2026, 17:00 en Guadalajara (23:00 UTC)
const monday5pm = new Date("2026-11-09T23:00:00Z");

describe("horarios de entrega", () => {
  it("respeta la anticipación mínima: lo primero en punto fijo es el martes a las 11:00 locales", () => {
    const first = availableSlots(opts, "sucursal", monday5pm)[0];
    expect(first.value).toBe("2026-11-10T17:00:00.000Z");
    expect(first.label).toBe("11:00");
    expect(first.day).toBe("mar 10 nov");
  });

  it("no ofrece domingos en punto fijo ni sábados en recolección", () => {
    const sucursal = availableSlots(opts, "sucursal", monday5pm);
    expect(sucursal.some((s) => s.day.startsWith("dom"))).toBe(false);
    expect(sucursal.some((s) => s.day.startsWith("sáb"))).toBe(true);
    const recoleccion = availableSlots(opts, "recoleccion", monday5pm);
    expect(recoleccion.some((s) => s.day.startsWith("sáb") || s.day.startsWith("dom"))).toBe(false);
  });

  it("la última cita del día termina a la hora de cierre", () => {
    const tuesday = availableSlots(opts, "sucursal", monday5pm).filter((s) => s.day === "mar 10 nov");
    expect(tuesday.map((s) => s.label)).toEqual(["11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"]);
  });

  it("recolección por ventanas y se describe con la ventana completa", () => {
    const slots = availableSlots(opts, "recoleccion", monday5pm);
    // martes 10:00 queda a 17 h (menos de las 18 de anticipación); la primera es la ventana de la tarde
    expect(slots[0].label).toBe("15:00 a 19:00");
    expect(describeSlot(opts, "recoleccion", new Date(slots[0].value))).toBe("mar 10 nov, de 15:00 a 19:00");
    expect(slots[1]).toMatchObject({ label: "10:00 a 14:00", day: "mié 11 nov" });
  });

  it("solo acepta horarios que se ofrecieron", () => {
    expect(isAvailableSlot(opts, "sucursal", "2026-11-10T17:00:00.000Z", monday5pm)).toBe(true);
    expect(isAvailableSlot(opts, "sucursal", "2026-11-10T17:30:00.000Z", monday5pm)).toBe(false);
    expect(isAvailableSlot(opts, "sucursal", "2026-11-09T23:00:00.000Z", monday5pm)).toBe(false);
  });

  it("cobertura de recolección por código postal", () => {
    expect(pickupCovers(opts, "44100")).toBe(true);
    expect(pickupCovers(opts, "45050")).toBe(true);
    expect(pickupCovers(opts, "06700")).toBe(false);
    expect(pickupCovers(opts, "4410")).toBe(false);
  });

  it("opciones incompletas en la base se completan con los valores por defecto", () => {
    const o = normalizeIntakeOptions({ sucursal: { address: "Av. Chapultepec 100" } });
    expect(o.sucursal.address).toBe("Av. Chapultepec 100");
    expect(o.sucursal.from_hour).toBe(11);
    expect(o.recoleccion.enabled).toBe(true);
  });
});

describe("SKU y slug", () => {
  it("SKU con año local y consecutivo", () => {
    expect(formatSku(42, monday5pm)).toBe("R26-00042");
    // 31 de diciembre a las 20:00 en Guadalajara ya es 1 de enero en UTC; el año es el local
    expect(formatSku(7, new Date("2027-01-01T02:00:00Z"))).toBe("R26-00007");
  });

  it("slug sin acentos ni símbolos y único por SKU", () => {
    expect(productSlug("Hermès", "Birkin 30 Gold & Togo", "R26-00042")).toBe("hermes-birkin-30-gold-togo-r26-00042");
  });
});

describe("checklist de autenticación", () => {
  const items = checklistFor("sneakers");
  const allOk = Object.fromEntries(items.map((i) => [i.id, "ok" as const]));

  it("calzado incluye suela; bolsos herrajes", () => {
    expect(items.some((i) => i.id === "suela")).toBe(true);
    expect(checklistFor("designer-bags").some((i) => i.id === "herrajes")).toBe(true);
  });

  it("auténtica exige todo revisado y nada fallando", () => {
    expect(checklistProblem(items, allOk, "autentica")).toBeNull();
    expect(checklistProblem(items, { ...allOk, suela: undefined }, "autentica")).toMatch(/Falta revisar/);
    expect(checklistProblem(items, { ...allOk, suela: "falla" }, "autentica")).toMatch(/No puede ser auténtica/);
    expect(checklistProblem(items, { ...allOk, coincide_fotos: "na" }, "autentica")).toMatch(/misma pieza/);
  });

  it("no auténtica exige al menos un punto que falla; no concluyente puede quedar incompleto", () => {
    expect(checklistProblem(items, allOk, "no_autentica")).toBe("Marca qué punto falla");
    expect(checklistProblem(items, { ...allOk, codigos: "falla" }, "no_autentica")).toBeNull();
    expect(checklistProblem(items, {}, "no_concluyente")).toBeNull();
  });
});
