import { describe, expect, it } from "vitest";
import { aiAssessmentSchema, sanitize } from "../ai";
import { draftSchema, readDraftForm } from "../schemas";
import { submissionBlockers } from "../service";
import { isOwnedPhotoUrl } from "../../storage";
import { missingRequiredSlots, newPossessionCode, photoGuideFor } from "../../domain/photo-guide";

describe("guía de fotos", () => {
  it("sneakers pide suelas; bolsos pide interior; ropa no", () => {
    expect(photoGuideFor("sneakers").some((s) => s.slot === "suela" && s.required)).toBe(true);
    expect(photoGuideFor("designer-bags").some((s) => s.slot === "interior" && s.required)).toBe(true);
    expect(photoGuideFor("luxury-clothing").some((s) => s.slot === "suela")).toBe(false);
  });
  it("detecta las tomas obligatorias que faltan", () => {
    expect(missingRequiredSlots("sneakers", ["frente", "espalda"]).map((s) => s.slot)).toEqual(["etiqueta", "suela"]);
    expect(missingRequiredSlots("luxury-clothing", ["frente", "espalda", "etiqueta"])).toEqual([]);
  });
  it("el código de posesión es legible a mano", () => {
    for (let i = 0; i < 50; i++) expect(newPossessionCode()).toMatch(/^RL-[ACDEFGHJKMNPQRTUVWXY34679]{5}$/);
  });
});

describe("bloqueos para enviar", () => {
  const photos = (slots: string[]) => slots.map((slot, i) => ({ id: String(i), url: "u", slot, kind: slot === "posesion" ? "prueba_posesion" : "preliminar" }));
  it("exige obligatorias y prueba de posesión", () => {
    expect(submissionBlockers({ category_slug: "luxury-clothing", photos: photos(["frente"]) })).toEqual([
      "Falta la foto: Espalda",
      "Falta la foto: Etiquetas interiores",
      "Falta la foto de prueba de posesión con tu código",
    ]);
    expect(submissionBlockers({ category_slug: "luxury-clothing", photos: photos(["frente", "espalda", "etiqueta", "posesion"]) })).toEqual([]);
  });
});

describe("formulario de la pieza", () => {
  const form = (entries: [string, string][]) => {
    const f = new FormData();
    for (const [k, v] of entries) f.append(k, v);
    return f;
  };
  it("convierte el precio a centavos y acepta marca escrita a mano", () => {
    const parsed = draftSchema.parse(
      readDraftForm(
        form([
          ["categorySlug", "designer-bags"],
          ["brandSlug", "otra"],
          ["brandName", "The Row"],
          ["model", "Margaux 15"],
          ["declaredCondition", "excelente"],
          ["includes", "full_set"],
          ["includes", "ticket_boutique"],
          ["askingPrice", "$45,000"],
        ]),
      ),
    );
    expect(parsed.askingPriceCents).toBe(4_500_000);
    expect(parsed.brandSlug).toBeNull();
    expect(parsed.brandName).toBe("The Row");
    expect(parsed.includes).toEqual(["full_set", "ticket_boutique"]);
  });
  it("rechaza sin marca, precio bajo o condición inválida", () => {
    const r = draftSchema.safeParse(readDraftForm(form([["categorySlug", "sneakers"], ["model", "Dunk"], ["declaredCondition", "nuevo"], ["askingPrice", "100"]])));
    expect(r.success).toBe(false);
    const fields = r.success ? [] : r.error.issues.map((i) => i.path[0]);
    expect(fields).toEqual(expect.arrayContaining(["declaredCondition", "askingPriceCents"]));
  });
});

describe("fotos propias", () => {
  const prefix = "solicitudes/u1/p1/";
  it("acepta solo URLs de nuestro almacenamiento dentro de la carpeta correcta", () => {
    expect(isOwnedPhotoUrl("/api/fotos/local/solicitudes/u1/p1/a.jpg", "solicitudes/u1/p1/a.jpg", prefix)).toBe(true);
    expect(isOwnedPhotoUrl("https://abc.public.blob.vercel-storage.com/solicitudes/u1/p1/a-x1.jpg", "solicitudes/u1/p1/a-x1.jpg", prefix)).toBe(true);
    expect(isOwnedPhotoUrl("https://abc.public.blob.vercel-storage.com/solicitudes/u2/p1/a.jpg", "solicitudes/u2/p1/a.jpg", prefix)).toBe(false);
    expect(isOwnedPhotoUrl("https://evil.com/solicitudes/u1/p1/a.jpg", "solicitudes/u1/p1/a.jpg", prefix)).toBe(false);
    expect(isOwnedPhotoUrl("/api/fotos/local/solicitudes/u1/p1/../../u2/a.jpg", "solicitudes/u1/p1/../../u2/a.jpg", prefix)).toBe(false);
  });
});

describe("evaluación con IA", () => {
  const base = {
    necesita_mas_fotos: false,
    calificacion: 8.5,
    confianza: 0.8,
    resumen: "Buen estado general. Ligero desgaste en esquinas.",
    defectos: [{ zona: "Esquinas", descripcion: "Desgaste leve", severidad: "leve" as const }],
    zonas_faltantes: [],
    recomendaciones: ["Agregar foto de la base"],
  };
  it("valida la estructura de la respuesta", () => {
    expect(aiAssessmentSchema.safeParse(base).success).toBe(true);
    expect(aiAssessmentSchema.safeParse({ ...base, calificacion: 11 }).success).toBe(false);
    expect(aiAssessmentSchema.safeParse({ ...base, calificacion: null }).success).toBe(false);
    expect(aiAssessmentSchema.safeParse({ ...base, calificacion: null, necesita_mas_fotos: true }).success).toBe(true);
  });
  it("quita cualquier frase sobre autenticidad", () => {
    const s = sanitize({
      ...base,
      resumen: "Buen estado general. Parece un artículo auténtico. Esquinas con ligero uso.",
      defectos: [...base.defectos, { zona: "Logo", descripcion: "Podría ser réplica", severidad: "importante" }],
      recomendaciones: ["Verificar si es original.", "Foto de la base."],
    });
    expect(s.resumen).toBe("Buen estado general. Esquinas con ligero uso.");
    expect(s.defectos).toHaveLength(1);
    expect(s.recomendaciones).toEqual(["Foto de la base."]);
  });
});
