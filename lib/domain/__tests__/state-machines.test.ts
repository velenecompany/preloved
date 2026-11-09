import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  MONEY_TRANSITIONS,
  ORDER_TRANSITIONS,
  PRODUCT_STATUSES,
  PRODUCT_TRANSITIONS,
  publishBlockers,
} from "../state-machines";
import { isValidClabe } from "../clabe";

describe("máquina de estados de la pieza", () => {
  it("no permite publicar directamente una solicitud", () => {
    expect(canTransition(PRODUCT_TRANSITIONS, "solicitud_enviada", "publicada")).toBe(false);
    expect(canTransition(PRODUCT_TRANSITIONS, "recibida", "publicada")).toBe(false);
    expect(() => assertTransition("pieza", PRODUCT_TRANSITIONS, "en_autenticacion", "publicada")).toThrow(/inválida/);
  });
  it("una pieza que falló autenticación solo puede devolverse", () => {
    expect(PRODUCT_TRANSITIONS.autenticacion_fallida).toEqual(["devolucion_pendiente"]);
  });
  it("los estados finales no tienen salida", () => {
    for (const s of ["rechazada", "cerrada", "retirada_por_vendedor", "devuelta_al_vendedor"] as const) {
      expect(PRODUCT_TRANSITIONS[s]).toEqual([]);
    }
  });
  it("todos los destinos son estados conocidos", () => {
    for (const targets of Object.values(PRODUCT_TRANSITIONS)) {
      for (const t of targets) expect(PRODUCT_STATUSES).toContain(t);
    }
  });
  it("coincide exactamente con las transiciones de la migración SQL", () => {
    const sql = readFileSync(
      join(process.cwd(), "db/migrations/001_schema.sql"),
      "utf8",
    );
    const block = sql.split("-- BEGIN product_status_transitions")[1].split("-- END product_status_transitions")[0];
    const fromSql = [...block.matchAll(/\('([a-z_]+)',\s*'([a-z_]+)'\)/g)].map((m) => `${m[1]}>${m[2]}`).sort();
    const fromTs = Object.entries(PRODUCT_TRANSITIONS)
      .flatMap(([from, tos]) => tos.map((to) => `${from}>${to}`))
      .sort();
    expect(fromSql).toEqual(fromTs);
  });
});

describe("regla de oro de publicación", () => {
  const ok = { authenticationResult: "autentica" as const, agreementAccepted: true, finalImageCount: 4, finalConditionScore: 8.5 };
  it("permite publicar con todo completo", () => {
    expect(publishBlockers(ok)).toEqual([]);
  });
  it("bloquea sin autenticación física aprobada", () => {
    expect(publishBlockers({ ...ok, authenticationResult: null })).toHaveLength(1);
    expect(publishBlockers({ ...ok, authenticationResult: "no_concluyente" })).toHaveLength(1);
  });
  it("bloquea sin contrato, fotos o condición confirmada", () => {
    expect(publishBlockers({ authenticationResult: "autentica", agreementAccepted: false, finalImageCount: 0, finalConditionScore: null })).toHaveLength(3);
  });
});

describe("estados del dinero", () => {
  it("el dinero solo se libera pasando por retenido", () => {
    expect(canTransition(MONEY_TRANSITIONS, "cobrado", "disponible")).toBe(false);
    expect(canTransition(MONEY_TRANSITIONS, "retenido", "disponible")).toBe(true);
  });
  it("no se puede reembolsar dinero ya liquidado ni en lote", () => {
    expect(canTransition(MONEY_TRANSITIONS, "liquidado", "reembolsado")).toBe(false);
    expect(canTransition(MONEY_TRANSITIONS, "en_lote_de_pago", "reembolsado")).toBe(false);
  });
  it("una disputa bloquea la liberación hasta resolverse", () => {
    expect(canTransition(MONEY_TRANSITIONS, "en_disputa", "en_lote_de_pago")).toBe(false);
  });
});

describe("estados del pedido", () => {
  it("solo se puede disputar dentro de la ventana de aceptación", () => {
    expect(canTransition(ORDER_TRANSITIONS, "en_ventana_aceptacion", "en_disputa")).toBe(true);
    expect(canTransition(ORDER_TRANSITIONS, "cerrado", "en_disputa")).toBe(false);
  });
});

describe("CLABE", () => {
  it("valida el dígito verificador", () => {
    expect(isValidClabe("002010077777777771")).toBe(true);
    expect(isValidClabe("002010077777777772")).toBe(false);
    expect(isValidClabe("12345")).toBe(false);
  });
});
