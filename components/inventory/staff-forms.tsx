"use client";

import { useActionState, useState } from "react";
import { FormMessage, initialFormState, keepValuesOnSubmit, SubmitButton, type FormState } from "@/components/form";
import type { ChecklistItem } from "@/lib/domain/inventory";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const selectClass = "w-full border border-linea bg-white px-3 py-2.5 text-base focus:border-tinta focus:outline-none";
const textareaClass = "w-full border border-linea bg-white px-3 py-2.5 text-base focus:border-tinta focus:outline-none";

export function IntakeForm({
  action,
  defaultMethod,
  methods,
  items,
  declared,
}: {
  action: Action;
  defaultMethod: string;
  methods: { value: string; label: string }[];
  items: { value: string; label: string }[];
  declared: string[];
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form onSubmit={keepValuesOnSubmit(formAction)} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <div className="max-w-xs">
        <label htmlFor="method" className="mb-1.5 block text-sm font-medium">
          Cómo llegó
        </label>
        <select id="method" name="method" defaultValue={defaultMethod} className={selectClass}>
          {methods.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        {e.method && <p className="mt-1.5 text-sm">{e.method}</p>}
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Qué llegó con la pieza</legend>
        <p className="mb-3 text-xs text-piedra">Marcado: lo que el vendedor dijo que incluye. Ajusta a lo que realmente llegó.</p>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {items.map((i) => (
            <label key={i.value} className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="accessories" value={i.value} defaultChecked={declared.includes(i.value)} className="accent-tinta" />
              {i.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="notes" className="mb-1.5 block text-sm font-medium">
          Notas de recepción (internas)
        </label>
        <textarea id="notes" name="notes" rows={3} maxLength={1500} className={textareaClass} placeholder="Estado del empaque, diferencias con las fotos, etc." />
      </div>
      <SubmitButton pendingLabel="Registrando…" pending={pending}>
        Registrar recepción
      </SubmitButton>
    </form>
  );
}

export function AuthenticationForm({ action, items }: { action: Action; items: ChecklistItem[] }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [result, setResult] = useState("");
  const e = state.fieldErrors ?? {};
  return (
    <form onSubmit={keepValuesOnSubmit(formAction)} className="space-y-6" noValidate>
      <FormMessage state={state} />
      <fieldset>
        <legend className="mb-3 font-medium">Checklist</legend>
        <div className="divide-y divide-linea border-y border-linea">
          {items.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
              <span className="min-w-[14rem] flex-1">{i.label}</span>
              <span className="flex gap-4" role="radiogroup" aria-label={i.label}>
                {[
                  ["ok", "Bien"],
                  ["falla", "Falla"],
                  ["na", "No aplica"],
                ].map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5">
                    <input type="radio" name={`check_${i.id}`} value={v} className="accent-tinta" />
                    {l}
                  </label>
                ))}
              </span>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 font-medium">Resultado</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["autentica", "Auténtica", "Pasa a contrato"],
            ["no_autentica", "No auténtica", "Se devuelve al vendedor"],
            ["no_concluyente", "No concluyente", "Queda para otra revisión"],
          ].map(([v, l, d]) => (
            <label key={v} className={`cursor-pointer border px-4 py-3 text-sm ${result === v ? "border-tinta bg-white" : "border-linea"}`}>
              <input type="radio" name="result" value={v} checked={result === v} onChange={() => setResult(v)} className="sr-only" />
              <span className="block font-medium">{l}</span>
              <span className="text-grafito">{d}</span>
            </label>
          ))}
        </div>
        {e.result && <p className="mt-1.5 text-sm">{e.result}</p>}
      </fieldset>

      {result === "autentica" && (
        <div className="max-w-xs">
          <label htmlFor="conditionScore" className="mb-1.5 block text-sm font-medium">
            Condición confirmada (1 a 10)
          </label>
          <input id="conditionScore" name="conditionScore" type="number" min={1} max={10} step={0.5} className={selectClass} />
          {e.conditionScore && <p className="mt-1.5 text-sm">{e.conditionScore}</p>}
          <p className="mt-1.5 text-xs text-piedra">Es la calificación que verá el comprador.</p>
        </div>
      )}

      {result === "no_autentica" && (
        <div>
          <label htmlFor="sellerMessage" className="mb-1.5 block text-sm font-medium">
            Mensaje para el vendedor
          </label>
          <textarea id="sellerMessage" name="sellerMessage" rows={3} maxLength={1000} className={textareaClass} placeholder="Qué no coincide, sin detalles que enseñen a falsificar." />
          {e.sellerMessage && <p className="mt-1.5 text-sm">{e.sellerMessage}</p>}
        </div>
      )}

      <div>
        <label htmlFor="notes" className="mb-1.5 block text-sm font-medium">
          Notas internas
        </label>
        <textarea id="notes" name="notes" rows={3} maxLength={2000} className={textareaClass} />
      </div>

      <SubmitButton pendingLabel="Guardando…" pending={pending}>
        Guardar autenticación
      </SubmitButton>
    </form>
  );
}

export function PublishForm({ action, description, ready }: { action: Action; description: string; ready: boolean }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form onSubmit={keepValuesOnSubmit(formAction)} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-medium">
          Descripción pública
        </label>
        <textarea id="description" name="description" rows={5} maxLength={2000} defaultValue={description} className={textareaClass} />
        {state.fieldErrors?.description && <p className="mt-1.5 text-sm">{state.fieldErrors.description}</p>}
      </div>
      {!ready && <p className="text-sm">Sube al menos una foto final para publicar.</p>}
      <SubmitButton pendingLabel="Publicando…" pending={pending}>
        Publicar en el catálogo
      </SubmitButton>
    </form>
  );
}

export function ReturnForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form onSubmit={keepValuesOnSubmit(formAction)} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div>
        <label htmlFor="notes" className="mb-1.5 block text-sm font-medium">
          Cómo se devolvió (opcional)
        </label>
        <textarea id="notes" name="notes" rows={2} maxLength={1000} className={textareaClass} placeholder="Entregada en punto fijo, guía de paquetería, etc." />
      </div>
      <SubmitButton pendingLabel="Guardando…" pending={pending}>
        Marcar como devuelta
      </SubmitButton>
    </form>
  );
}

export function UnpublishForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <details className="border-t border-linea pt-5">
      <summary className="cursor-pointer text-sm underline underline-offset-4">Retirar del catálogo</summary>
      <form onSubmit={keepValuesOnSubmit(formAction)} className="mt-4 space-y-4" noValidate>
        <FormMessage state={state} />
        <p className="text-sm text-grafito">
          Deja de mostrarse en el catálogo y pasa a devoluciones. Úsalo por daño, disputa, error o una pieza de prueba. Si es el vendedor quien la quiere de vuelta, debe pedir el retiro desde su cuenta.
        </p>
        <div>
          <label htmlFor="reason" className="mb-1.5 block text-sm font-medium">
            Motivo
          </label>
          <textarea id="reason" name="reason" rows={2} maxLength={300} className={textareaClass} />
          {state.fieldErrors?.reason && <p className="mt-1.5 text-sm">{state.fieldErrors.reason}</p>}
        </div>
        <SubmitButton pendingLabel="Retirando…" pending={pending}>
          Retirar del catálogo
        </SubmitButton>
      </form>
    </details>
  );
}
