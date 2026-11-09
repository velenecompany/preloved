import "server-only";
import { z } from "zod";
import { query } from "@/lib/db";
import { photoBytes } from "@/lib/storage";
import { AI_SLOT_PRIORITY } from "@/lib/domain/photo-guide";
import { DECLARED_CONDITION_LABEL } from "@/lib/domain/labels";

/**
 * Evaluación preliminar de condición con un modelo de visión (Groq).
 * Solo describe la condición visible. Nunca determina autenticidad.
 * Si falla o no hay llave, la solicitud sigue su curso y se puede reintentar desde el panel.
 */

const DEFAULT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const MAX_IMAGES = 5;
const TIMEOUT_MS = 45_000;

export const aiAssessmentSchema = z
  .object({
    necesita_mas_fotos: z.boolean(),
    calificacion: z.number().min(1).max(10).nullable(),
    confianza: z.number().min(0).max(1),
    resumen: z.string().min(1).max(800),
    defectos: z
      .array(z.object({ zona: z.string().max(80), descripcion: z.string().max(300), severidad: z.enum(["leve", "moderada", "importante"]) }))
      .max(12),
    zonas_faltantes: z.array(z.string().max(120)).max(10),
    recomendaciones: z.array(z.string().max(200)).max(6),
  })
  .refine((a) => a.calificacion !== null || a.necesita_mas_fotos, "Sin calificación debe pedir más fotos");
export type AiAssessment = z.infer<typeof aiAssessmentSchema>;

const SYSTEM_PROMPT = `Eres un evaluador de condición de artículos de moda de segunda mano para una tienda de consignación en México.
Analizas SOLO lo que se ve en las fotos: desgaste, manchas, raspones, deformaciones, costuras, suelas, esquinas, herrajes.

Reglas obligatorias:
- NUNCA opines sobre si el artículo es auténtico, original o réplica. No uses palabras como "auténtico", "original", "falso" ni "réplica". La autenticidad la determina una persona con la pieza en la mano.
- Si las fotos están borrosas, oscuras o no muestran zonas clave (por ejemplo suelas en calzado, esquinas en bolsos), marca "necesita_mas_fotos": true. Si no puedes calificar con confianza, deja "calificacion": null.
- No inventes defectos que no se vean. Si algo no se aprecia, dilo en "zonas_faltantes".
- Escribe en español de México, claro y breve.

Escala de "calificacion" (puedes usar medios puntos, ej. 8.5):
10 nuevo sin señales de uso; 9 prácticamente nuevo; 8 excelente, desgaste casi imperceptible; 7 muy buena, desgaste ligero; 6 buena, señales visibles de uso; 5 aceptable, desgaste moderado; 4 desgaste considerable; 3 daños importantes; 2 condición deficiente; 1 muy deteriorado.

Responde SOLO con un objeto JSON con exactamente estas claves:
{"necesita_mas_fotos": boolean, "calificacion": number|null, "confianza": number entre 0 y 1, "resumen": string, "defectos": [{"zona": string, "descripcion": string, "severidad": "leve"|"moderada"|"importante"}], "zonas_faltantes": [string], "recomendaciones": [string]}`;

export function aiConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

async function imageInput(url: string): Promise<string | null> {
  const bytes = await photoBytes(url);
  if (bytes) {
    if (bytes.length > 3_800_000) return null; // límite de Groq para imágenes en base64
    return `data:image/jpeg;base64,${bytes.toString("base64")}`;
  }
  return url.startsWith("https://") ? url : null;
}

export async function assessCondition(productId: string): Promise<{ ok: true; assessment: AiAssessment } | { ok: false; error: string }> {
  if (!aiConfigured()) return { ok: false, error: "Falta GROQ_API_KEY" };

  const [product] = await query<{ brand: string; model: string; category: string; declared_condition: string; description: string | null }>(
    `select b.name as brand, p.model, c.name as category, p.declared_condition, p.description
     from products p join brands b on b.id = p.brand_id join product_categories c on c.id = p.category_id
     where p.id = $1`,
    [productId],
  );
  if (!product) return { ok: false, error: "No existe la pieza" };

  const photos = await query<{ url: string; slot: string | null }>(
    "select url, slot from product_images where product_id = $1 and kind = 'preliminar' order by sort_order, created_at",
    [productId],
  );
  const ordered = [...photos].sort(
    (a, b) => rank(a.slot) - rank(b.slot),
  );
  const images: { slot: string; data: string }[] = [];
  for (const p of ordered) {
    if (images.length >= MAX_IMAGES) break;
    const data = await imageInput(p.url);
    if (data) images.push({ slot: p.slot ?? "foto", data });
  }
  if (images.length === 0) return { ok: false, error: "No hay fotos utilizables" };

  const model = process.env.GROQ_VISION_MODEL || DEFAULT_MODEL;
  const userText = `Artículo: ${product.brand} ${product.model} (${product.category}).
Condición declarada por quien vende: ${DECLARED_CONDITION_LABEL[product.declared_condition] ?? product.declared_condition}.
${product.description ? `Descripción de quien vende: ${product.description.slice(0, 600)}` : ""}
Fotos en orden: ${images.map((i, n) => `${n + 1}) ${i.slot}`).join(", ")}.
Evalúa la condición visible.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let raw: unknown;
  try {
    const base = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_completion_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [{ type: "text", text: userText }, ...images.map((i) => ({ type: "image_url", image_url: { url: i.data } }))],
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: `Groq respondió ${res.status}: ${(await res.text()).slice(0, 300)}` };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    raw = JSON.parse(body.choices?.[0]?.message?.content ?? "null");
  } catch (e) {
    return { ok: false, error: controller.signal.aborted ? "La evaluación tardó demasiado" : `Error al evaluar: ${(e as Error).message}` };
  } finally {
    clearTimeout(timer);
  }

  const parsed = aiAssessmentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "La respuesta de la IA no tiene el formato esperado" };
  const a = sanitize(parsed.data);

  await query(
    `insert into condition_assessments
       (product_id, source, score, needs_more_photos, confidence, summary, defects, missing_areas, recommendations, model, raw_response)
     values ($1, 'ia', $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      productId,
      a.calificacion === null ? null : Math.round(a.calificacion * 2) / 2,
      a.necesita_mas_fotos,
      Math.round(a.confianza * 100) / 100,
      a.resumen,
      JSON.stringify(a.defectos.map((d) => ({ area: d.zona, description: d.descripcion, severity: d.severidad }))),
      a.zonas_faltantes,
      a.recomendaciones,
      model,
      JSON.stringify(raw),
    ],
  );
  return { ok: true, assessment: a };
}

function rank(slot: string | null): number {
  const i = slot ? AI_SLOT_PRIORITY.indexOf(slot) : -1;
  return i === -1 ? AI_SLOT_PRIORITY.length : i;
}

const FORBIDDEN = /\b(aut[eé]ntic\w*|original(es)?|r[eé]plicas?|falsificad\w*|fals[oa]s?)\b/i;

/** Defensa extra: si el modelo menciona autenticidad pese a las instrucciones, se quitan esas frases. */
export function sanitize(a: AiAssessment): AiAssessment {
  const clean = (text: string) =>
    text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !FORBIDDEN.test(sentence))
      .join(" ")
      .trim();
  return {
    ...a,
    resumen: clean(a.resumen) || "Evaluación de la condición visible.",
    defectos: a.defectos.filter((d) => !FORBIDDEN.test(d.descripcion)),
    recomendaciones: a.recomendaciones.map(clean).filter(Boolean),
  };
}
