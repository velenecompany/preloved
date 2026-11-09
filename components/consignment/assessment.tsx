import type { AssessmentRow } from "@/lib/consignment/service";
import { conditionScaleLabel, formatScore } from "@/lib/domain/labels";

/** Lectura preliminar de condición con IA. Siempre se presenta como preliminar y sin opinión de autenticidad. */
export function AiAssessmentCard({ assessment, audience }: { assessment: AssessmentRow; audience: "vendedor" | "equipo" }) {
  const score = assessment.score === null ? null : Number(assessment.score);
  return (
    <div className="border border-linea bg-white px-5 py-5">
      <p className="text-sm text-grafito">Lectura preliminar de condición con IA</p>
      {score !== null ? (
        <p className="mt-1 font-display text-3xl">
          {formatScore(score)}/10 <span className="font-sans text-base text-grafito">{conditionScaleLabel(score).toLowerCase()}</span>
        </p>
      ) : (
        <p className="mt-1 font-medium">Sin calificación: las fotos no alcanzan para evaluar.</p>
      )}
      {assessment.summary && <p className="mt-3 max-w-[68ch] text-grafito">{assessment.summary}</p>}

      {assessment.defects.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {assessment.defects.map((d, i) => (
            <li key={i} className="grid grid-cols-[8rem_1fr] gap-3">
              <span className="text-piedra">{d.area}</span>
              <span>
                {d.description}
                {d.severity && audience === "equipo" ? <span className="text-piedra"> ({d.severity})</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {(assessment.needs_more_photos || assessment.missing_areas.length > 0) && (
        <div className="mt-4 text-sm">
          <p className="font-medium">Fotos que ayudarían</p>
          <ul className="mt-1 list-disc pl-5 text-grafito">
            {assessment.missing_areas.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {audience === "equipo" && assessment.recommendations.length > 0 && (
        <div className="mt-4 text-sm">
          <p className="font-medium">Recomendaciones</p>
          <ul className="mt-1 list-disc pl-5 text-grafito">
            {assessment.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-4 text-xs text-piedra">
        {audience === "vendedor"
          ? "Es una lectura automática de tus fotos, no una calificación final. La condición definitiva la confirma una persona al recibir la pieza. La IA no evalúa autenticidad."
          : `Modelo ${assessment.model ?? "desconocido"}${assessment.confidence ? `, confianza ${Math.round(Number(assessment.confidence) * 100)} %` : ""}. Preliminar: confirmar en la inspección física.`}
      </p>
    </div>
  );
}
