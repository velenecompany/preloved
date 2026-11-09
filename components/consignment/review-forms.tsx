"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { Field, FormMessage, initialFormState, keepValuesOnSubmit, SubmitButton, type FormState } from "@/components/form";
import { computeCommission, findRule, type CommissionRule } from "@/lib/domain/commissions";
import { formatMXN, pesosToCents } from "@/lib/domain/money";

type BoundAction = (state: FormState, formData: FormData) => Promise<FormState>;
type Tab = "preaprobada" | "requiere_informacion" | "rechazada";

const QUICK_REASONS = [
  "La marca no está entre las que aceptamos por ahora.",
  "La condición visible no alcanza el mínimo que publicamos.",
  "El precio esperado está muy por encima del mercado actual para esta pieza.",
  "Las fotos muestran detalles que no podemos validar para consignación.",
];

const textareaClass = "w-full border border-linea bg-white px-3 py-2.5 text-base focus:border-tinta focus:outline-none";

export function ReviewForms({ action, askingPesos, group, rules }: { action: BoundAction; askingPesos: number; group: string; rules: CommissionRule[] }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [tab, setTab] = useState<Tab>("preaprobada");
  const [price, setPrice] = useState(String(askingPesos));
  const [reason, setReason] = useState("");
  const e = state.fieldErrors ?? {};

  const preview = useMemo(() => {
    const pesos = Number(price.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(pesos) || pesos < 500) return null;
    try {
      const cents = pesosToCents(Math.round(pesos));
      return computeCommission(cents, findRule(rules, group, cents));
    } catch {
      return null;
    }
  }, [price, rules, group]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "preaprobada", label: "Preaprobar" },
    { id: "requiere_informacion", label: "Pedir información" },
    { id: "rechazada", label: "Rechazar" },
  ];

  return (
    <div className="border border-tinta bg-white">
      <div role="tablist" aria-label="Respuesta" className="grid grid-cols-3 border-b border-linea text-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-3 ${tab === t.id ? "bg-tinta text-papel" : "hover:bg-papel"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <form onSubmit={keepValuesOnSubmit(formAction)} className="space-y-5 p-5" noValidate>
        <FormMessage state={state} />
        <input type="hidden" name="decision" value={tab} />

        {tab === "preaprobada" && (
          <>
            <Field
              label="Precio de publicación propuesto, en pesos"
              name="offeredPrice"
              inputMode="numeric"
              value={price}
              onChange={(ev) => setPrice(ev.target.value)}
              error={e.offeredPrice}
            />
            {preview && (
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-grafito">Comisión ({preview.rateBps / 100} %)</dt>
                  <dd>{formatMXN(preview.commissionCents)}</dd>
                </div>
                <div className="flex justify-between font-medium">
                  <dt>El vendedor recibe</dt>
                  <dd>{formatMXN(preview.sellerGrossCents)}</dd>
                </div>
              </dl>
            )}
            <div>
              <label htmlFor="notes-pre" className="mb-1.5 block text-sm font-medium">Mensaje para el vendedor (opcional)</label>
              <textarea id="notes-pre" name="notes" rows={3} className={textareaClass} placeholder="Por qué este precio, o qué revisaremos al recibirla." />
            </div>
            <SubmitButton pendingLabel="Enviando…" pending={pending}>Enviar propuesta</SubmitButton>
          </>
        )}

        {tab === "requiere_informacion" && (
          <>
            <div>
              <label htmlFor="notes-info" className="mb-1.5 block text-sm font-medium">Qué necesitas del vendedor</label>
              <textarea
                id="notes-info"
                name="notes"
                rows={4}
                className={textareaClass}
                placeholder="Ej.: una foto de la etiqueta interior donde se lea el código, y otra de las esquinas de la base."
                aria-invalid={e.notes ? true : undefined}
              />
              {e.notes && <p className="mt-1.5 text-sm">{e.notes}</p>}
            </div>
            <SubmitButton pendingLabel="Enviando…" pending={pending}>Pedir información</SubmitButton>
          </>
        )}

        {tab === "rechazada" && (
          <>
            <div className="space-y-2 text-sm">
              {QUICK_REASONS.map((q) => (
                <button key={q} type="button" onClick={() => setReason(q)} className="block text-left text-grafito underline-offset-4 hover:text-tinta hover:underline">
                  {q}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="reason" className="mb-1.5 block text-sm font-medium">Motivo para el vendedor</label>
              <textarea
                id="reason"
                name="reason"
                rows={3}
                value={reason}
                onChange={(ev) => setReason(ev.target.value)}
                className={textareaClass}
                aria-invalid={e.reason ? true : undefined}
              />
              {e.reason && <p className="mt-1.5 text-sm">{e.reason}</p>}
            </div>
            <SubmitButton pendingLabel="Enviando…" pending={pending}>Rechazar solicitud</SubmitButton>
          </>
        )}
      </form>
    </div>
  );
}

export function RunAssessmentButton({ productId, hasAssessment }: { productId: string; hasAssessment: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setStatus("running");
    setMessage(null);
    const res = await fetch(`/api/solicitudes/${productId}/evaluar`, { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as { ok?: boolean; error?: string; skipped?: string } | null;
    if (data?.ok) {
      setStatus("idle");
      router.refresh();
    } else {
      setStatus("error");
      setMessage(data?.error ?? data?.skipped ?? "No se pudo evaluar");
    }
  }

  return (
    <div className="text-sm">
      <button type="button" onClick={run} disabled={status === "running"} className="underline underline-offset-4 disabled:opacity-60">
        {status === "running" ? "Evaluando, puede tardar unos segundos…" : hasAssessment ? "Volver a evaluar con IA" : "Evaluar con IA"}
      </button>
      {message && <p className="mt-1">{message}</p>}
    </div>
  );
}
