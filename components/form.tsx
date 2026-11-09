"use client";

import { useFormStatus } from "react-dom";
import { startTransition, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";

export interface FormState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
  /** Valores para volver a llenar el formulario después de un error (nunca contraseñas). */
  values?: Record<string, string>;
}

export const initialFormState: FormState = {};

/**
 * React 19 vacía los formularios con `action={...}` al terminar la acción, aunque haya errores.
 * Con este onSubmit la acción corre igual, pero lo que escribió la persona se queda.
 */
export function keepValuesOnSubmit(formAction: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(formData));
  };
}

export function SubmitButton({ children, pendingLabel, pending: pendingProp }: { children: ReactNode; pendingLabel: string; pending?: boolean }) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="w-full bg-tinta px-6 py-3 text-sm text-papel hover:bg-grafito disabled:cursor-wait disabled:opacity-70 sm:w-auto"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  name: string;
  hint?: string;
  error?: string;
}

export function Field({ label, name, hint, error, className = "", ...input }: FieldProps) {
  const describedBy = [hint ? `${name}-hint` : null, error ? `${name}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full border bg-white px-3 py-2.5 text-base focus:border-tinta focus:outline-none ${error ? "border-tinta" : "border-linea"}`}
        {...input}
      />
      {hint && !error && (
        <p id={`${name}-hint`} className="mt-1.5 text-xs text-piedra">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${name}-error`} className="mt-1.5 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="border-l-2 border-tinta bg-white px-4 py-3 text-sm">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return (
      <p role="status" className="border-l-2 border-sello bg-white px-4 py-3 text-sm text-sello">
        {state.success}
      </p>
    );
  }
  return null;
}
