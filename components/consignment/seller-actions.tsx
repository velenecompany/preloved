"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Field, FormMessage, initialFormState, keepValuesOnSubmit, SubmitButton, type FormState } from "@/components/form";

type BoundAction = (state: FormState, formData: FormData) => Promise<FormState>;

export function SubmitRequestForm({ action }: { action: BoundAction }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Enviando…">Enviar a revisión</SubmitButton>
    </form>
  );
}

export function AcceptOfferForm({ action }: { action: BoundAction }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Aceptando…">Aceptar propuesta</SubmitButton>
    </form>
  );
}

export function CounterOfferForm({ action }: { action: BoundAction }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form onSubmit={keepValuesOnSubmit(formAction)} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <Field label="Tu precio, en pesos" name="price" inputMode="numeric" error={state.fieldErrors?.price} className="max-w-xs" />
      <div>
        <label htmlFor="note" className="mb-1.5 block text-sm font-medium">
          Comentario (opcional)
        </label>
        <textarea
          id="note"
          name="note"
          rows={3}
          maxLength={500}
          placeholder="Por qué propones ese precio: precio de compra, comparables, edición limitada…"
          className="w-full border border-linea bg-white px-3 py-2.5 text-base focus:border-tinta focus:outline-none"
        />
      </div>
      <SubmitButton pendingLabel="Enviando…" pending={pending}>Enviar contrapropuesta</SubmitButton>
    </form>
  );
}

export function ConfirmButton({ action, label, confirm }: { action: () => Promise<void>; label: string; confirm: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className="text-sm underline underline-offset-4">
        {label}
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-3 text-sm">
      <span>{confirm}</span>
      <button type="submit" className="border border-tinta px-3 py-1.5 hover:bg-tinta hover:text-papel">
        Sí, {label.toLowerCase()}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="underline underline-offset-4">
        Cancelar
      </button>
    </form>
  );
}

/** Al llegar desde el envío, pide la evaluación con IA una sola vez y refresca cuando termina. */
export function EvaluateOnArrival({ productId }: { productId: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [status, setStatus] = useState<"running" | "done" | "skipped">("running");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    fetch(`/api/solicitudes/${productId}/evaluar`, { method: "POST" })
      .then((r) => r.json())
      .then((d: { ok?: boolean }) => {
        setStatus(d.ok ? "done" : "skipped");
        if (d.ok) router.refresh();
      })
      .catch(() => setStatus("skipped"));
  }, [productId, router]);

  if (status !== "running") return null;
  return <p className="text-sm text-grafito">Estamos haciendo una lectura preliminar de la condición de tus fotos…</p>;
}
