"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormMessage, initialFormState, SubmitButton } from "@/components/form";
import { loginAction, registerAction, requestResetAction, resetPasswordAction } from "./actions";

export function LoginForm({ siguiente }: { siguiente?: string }) {
  const [state, action] = useActionState(loginAction, initialFormState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      {siguiente && <input type="hidden" name="siguiente" value={siguiente} />}
      <Field label="Correo" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <div>
        <Field label="Contraseña" name="password" type="password" autoComplete="current-password" required error={state.fieldErrors?.password} />
        <Link href="/recuperar" className="mt-2 inline-block text-sm text-grafito underline underline-offset-4 hover:text-tinta">
          Olvidé mi contraseña
        </Link>
      </div>
      <SubmitButton pendingLabel="Ingresando…">Ingresar</SubmitButton>
    </form>
  );
}

export function RegisterForm({ siguiente }: { siguiente?: string }) {
  const [state, action] = useActionState(registerAction, initialFormState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      {siguiente && <input type="hidden" name="siguiente" value={siguiente} />}
      <Field label="Nombre completo" name="fullName" autoComplete="name" required defaultValue={state.values?.fullName} error={state.fieldErrors?.fullName} />
      <Field label="Correo" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <Field
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="Al menos 10 caracteres, con letras y un número."
        error={state.fieldErrors?.password}
      />
      <div>
        <label className="flex items-start gap-3 text-sm text-grafito">
          <input type="checkbox" name="terms" className="mt-1 accent-tinta" aria-invalid={state.fieldErrors?.terms ? true : undefined} />
          <span>
            Acepto los{" "}
            <Link href="/legal/terminos" className="underline underline-offset-4 hover:text-tinta">términos y condiciones</Link> y el{" "}
            <Link href="/legal/privacidad" className="underline underline-offset-4 hover:text-tinta">aviso de privacidad</Link>.
          </span>
        </label>
        {state.fieldErrors?.terms && <p className="mt-1.5 text-sm">{state.fieldErrors.terms}</p>}
      </div>
      <SubmitButton pendingLabel="Creando cuenta…">Crear cuenta</SubmitButton>
    </form>
  );
}

export function RecoverForm() {
  const [state, action] = useActionState(requestResetAction, initialFormState);
  if (state.success) return <FormMessage state={state} />;
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field label="Correo de tu cuenta" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state.values?.email} error={state.fieldErrors?.email} />
      <SubmitButton pendingLabel="Enviando…">Enviar enlace</SubmitButton>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialFormState);
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <Field
        label="Contraseña nueva"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint="Al menos 10 caracteres, con letras y un número."
        error={state.fieldErrors?.password}
      />
      <Field label="Repite la contraseña" name="confirm" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirm} />
      <SubmitButton pendingLabel="Guardando…">Guardar contraseña</SubmitButton>
    </form>
  );
}
