"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, initialFormState, keepValuesOnSubmit, SubmitButton, type FormState } from "@/components/form";
import type { Slot } from "@/lib/domain/inventory";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const selectClass = "w-full border border-linea bg-white px-3 py-2.5 text-base focus:border-tinta focus:outline-none";

interface DeliveryProps {
  action: Action;
  methods: { sucursal: boolean; recoleccion: boolean; paqueteria: boolean };
  sucursal: { address: string; slots: Slot[] };
  recoleccion: { fee: string | null; municipalities: string[]; slots: Slot[] };
  paqueteria: { address: string; notes: string };
  defaults: { recipient: string; phone: string };
  submitLabel: string;
}

function SlotSelect({ slots, error }: { slots: Slot[]; error?: string }) {
  const days = [...new Set(slots.map((s) => s.day))];
  return (
    <div>
      <label htmlFor="slot" className="mb-1.5 block text-sm font-medium">
        Día y hora
      </label>
      <select id="slot" name="slot" defaultValue="" className={selectClass} aria-invalid={error ? true : undefined}>
        <option value="" disabled>
          Elige un horario
        </option>
        {days.map((d) => (
          <optgroup key={d} label={d}>
            {slots
              .filter((s) => s.day === d)
              .map((s) => (
                <option key={s.value} value={s.value}>
                  {d}, {s.label}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {error && <p className="mt-1.5 text-sm">{error}</p>}
    </div>
  );
}

/** El vendedor elige cómo nos entrega la pieza: punto fijo, recolección o paquetería. */
export function DeliveryForm({ action, methods, sucursal, recoleccion, paqueteria, defaults, submitLabel }: DeliveryProps) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const first = (["sucursal", "recoleccion", "paqueteria"] as const).find((m) => methods[m]) ?? "sucursal";
  const [method, setMethod] = useState<"sucursal" | "recoleccion" | "paqueteria">(first);
  const e = state.fieldErrors ?? {};

  const options = [
    { id: "sucursal" as const, title: "La llevo yo", text: "Agenda una cita en nuestro punto en Guadalajara." },
    { id: "recoleccion" as const, title: "Que pasen por ella", text: `Recolección a domicilio en la zona metropolitana${recoleccion.fee ? ` (${recoleccion.fee})` : ", sin costo"}.` },
    { id: "paqueteria" as const, title: "La envío por paquetería", text: "Para fuera de Guadalajara. El envío corre por tu cuenta." },
  ].filter((o) => methods[o.id]);

  return (
    <form onSubmit={keepValuesOnSubmit(formAction)} className="space-y-6" noValidate>
      <FormMessage state={state} />
      <fieldset>
        <legend className="sr-only">Cómo nos entregas la pieza</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {options.map((o) => (
            <label key={o.id} className={`cursor-pointer border px-4 py-3 ${method === o.id ? "border-tinta bg-white" : "border-linea hover:border-grafito"}`}>
              <input type="radio" name="method" value={o.id} checked={method === o.id} onChange={() => setMethod(o.id)} className="sr-only" />
              <span className="block font-medium">{o.title}</span>
              <span className="mt-1 block text-sm text-grafito">{o.text}</span>
            </label>
          ))}
        </div>
        {e.method && <p className="mt-1.5 text-sm">{e.method}</p>}
      </fieldset>

      {method === "sucursal" && (
        <div className="space-y-4">
          <p className="text-sm text-grafito">Dirección: {sucursal.address}</p>
          {sucursal.slots.length ? <SlotSelect slots={sucursal.slots} error={e.slot} /> : <p className="text-sm">No hay horarios disponibles en los próximos días. Escríbenos.</p>}
        </div>
      )}

      {method === "recoleccion" && (
        <div className="space-y-5">
          {recoleccion.slots.length ? <SlotSelect slots={recoleccion.slots} error={e.slot} /> : <p className="text-sm">No hay horarios disponibles en los próximos días. Escríbenos.</p>}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Quién entrega" name="recipient" defaultValue={defaults.recipient} error={e.recipient} autoComplete="name" />
            <Field label="Teléfono" name="phone" type="tel" defaultValue={defaults.phone} error={e.phone} autoComplete="tel" inputMode="tel" />
          </div>
          <Field label="Calle y número" name="street" error={e.street} autoComplete="street-address" />
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Colonia" name="neighborhood" error={e.neighborhood} />
            <div>
              <label htmlFor="municipality" className="mb-1.5 block text-sm font-medium">
                Municipio
              </label>
              <select id="municipality" name="municipality" defaultValue="" className={selectClass}>
                <option value="" disabled>
                  Elige
                </option>
                {recoleccion.municipalities.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              {e.municipality && <p className="mt-1.5 text-sm">{e.municipality}</p>}
            </div>
            <Field label="Código postal" name="postalCode" inputMode="numeric" maxLength={5} error={e.postalCode} autoComplete="postal-code" />
          </div>
          <Field label="Referencias (opcional)" name="references" error={e.references} hint="Entre qué calles, color de la casa, caseta, etc." />
        </div>
      )}

      {method === "paqueteria" && (
        <div className="space-y-2 text-sm">
          <p>
            Envía la pieza a: <span className="font-medium">{paqueteria.address}</span>
          </p>
          {paqueteria.notes && <p className="text-grafito">{paqueteria.notes}</p>}
          <p className="text-grafito">Después de enviarla, registra aquí la guía para darle seguimiento.</p>
        </div>
      )}

      <SubmitButton pendingLabel="Guardando…" pending={pending}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

export function TrackingForm({ action, carrier, tracking }: { action: Action; carrier: string; tracking: string }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const e = state.fieldErrors ?? {};
  return (
    <form onSubmit={keepValuesOnSubmit(formAction)} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Paquetería" name="carrier" defaultValue={carrier} error={e.carrier} placeholder="DHL, Estafeta, FedEx…" />
        <Field label="Número de guía" name="tracking" defaultValue={tracking} error={e.tracking} />
      </div>
      <SubmitButton pendingLabel="Guardando…" pending={pending}>
        Guardar guía
      </SubmitButton>
    </form>
  );
}

export function ContractForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form onSubmit={keepValuesOnSubmit(formAction)} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="acepto" className="mt-1 accent-tinta" />
        <span>Leí el contrato y acepto sus condiciones, incluido el precio, la comisión y la permanencia mínima.</span>
      </label>
      {state.fieldErrors?.acepto && <p className="text-sm">{state.fieldErrors.acepto}</p>}
      <SubmitButton pendingLabel="Aceptando…" pending={pending}>
        Aceptar contrato
      </SubmitButton>
    </form>
  );
}
