"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, initialFormState, keepValuesOnSubmit, SubmitButton } from "@/components/form";
import { bankFromClabe } from "@/lib/domain/banks";
import { site } from "@/config/site";
import { changePasswordAction, resendVerificationAction, savePayoutAction, updateProfileAction } from "./actions";

export function ProfileForm({ fullName, phone }: { fullName: string; phone: string }) {
  const [state, action, pending] = useActionState(updateProfileAction, initialFormState);
  return (
    <form onSubmit={keepValuesOnSubmit(action)} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field label="Nombre completo" name="fullName" autoComplete="name" defaultValue={fullName} error={state.fieldErrors?.fullName} />
      <Field
        label="Teléfono"
        name="phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        defaultValue={phone}
        hint="Para coordinar entregas y recolecciones."
        error={state.fieldErrors?.phone}
      />
      <SubmitButton pendingLabel="Guardando…" pending={pending}>Guardar datos</SubmitButton>
    </form>
  );
}

export function ResendVerificationForm() {
  const [state, action] = useActionState(resendVerificationAction, initialFormState);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      {!state.success && (
        <button type="submit" className="text-sm underline underline-offset-4">
          Enviarme otro enlace
        </button>
      )}
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialFormState);
  return (
    <form action={action} className="space-y-5" noValidate key={state.success ?? "form"}>
      <FormMessage state={state} />
      <Field label="Contraseña actual" name="current" type="password" autoComplete="current-password" error={state.fieldErrors?.current} />
      <Field
        label="Contraseña nueva"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Al menos 10 caracteres, con letras y un número."
        error={state.fieldErrors?.password}
      />
      <Field label="Repite la contraseña nueva" name="confirm" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} />
      <SubmitButton pendingLabel="Cambiando…">Cambiar contraseña</SubmitButton>
    </form>
  );
}

export function PayoutForm({
  initial,
}: {
  initial: { holderName: string; clabe: string; bankName: string; rfc: string } | null;
}) {
  const [state, action, pending] = useActionState(savePayoutAction, initialFormState);
  const values = state.values ?? initial ?? { holderName: "", clabe: "", bankName: "", rfc: "" };
  const [bankName, setBankName] = useState(values.bankName);
  const [bankTouched, setBankTouched] = useState(Boolean(values.bankName));

  return (
    <form onSubmit={keepValuesOnSubmit(action)} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field
        label="Titular de la cuenta"
        name="holderName"
        autoComplete="name"
        defaultValue={values.holderName}
        hint="Tal como aparece en tu banco. Debe ser tu propia cuenta."
        error={state.fieldErrors?.holderName}
      />
      <Field
        label="CLABE interbancaria"
        name="clabe"
        inputMode="numeric"
        autoComplete="off"
        maxLength={22}
        defaultValue={values.clabe}
        hint="18 dígitos. La encuentras en tu app bancaria."
        error={state.fieldErrors?.clabe}
        onChange={(e) => {
          const suggested = bankFromClabe(e.target.value);
          if (suggested && !bankTouched) setBankName(suggested);
        }}
      />
      <Field
        label="Banco"
        name="bankName"
        value={bankName}
        onChange={(e) => {
          setBankName(e.target.value);
          setBankTouched(true);
        }}
        hint="Lo llenamos con la CLABE; corrígelo si no coincide."
        error={state.fieldErrors?.bankName}
      />
      <Field
        label="RFC (opcional)"
        name="rfc"
        autoComplete="off"
        maxLength={13}
        defaultValue={values.rfc}
        hint="Si no lo das, pueden aplicarse retenciones fiscales mayores."
        error={state.fieldErrors?.rfc}
        style={{ textTransform: "uppercase" }}
      />
      <Field
        label={`Tu contraseña de ${site.name}`}
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        hint="La pedimos cada vez que cambias a dónde te pagamos."
        error={state.fieldErrors?.currentPassword}
      />
      <SubmitButton pendingLabel="Guardando…" pending={pending}>Guardar datos bancarios</SubmitButton>
    </form>
  );
}
