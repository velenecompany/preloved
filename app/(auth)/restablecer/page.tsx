import type { Metadata } from "next";
import { EmptyState } from "@/components/notices";
import { isResetTokenValid } from "@/lib/auth/service";
import { ResetForm } from "../forms";

export const metadata: Metadata = { title: "Elegir contraseña nueva" };
export const dynamic = "force-dynamic";

export default async function ResetPage(props: { searchParams: Promise<{ token?: string }> }) {
  const searchParams = await props.searchParams;
  const token = searchParams.token ?? "";
  const valid = token.length >= 20 && (await isResetTokenValid(token));

  if (!valid) {
    return (
      <EmptyState title="Este enlace ya no sirve" action={{ href: "/recuperar", label: "Pedir un enlace nuevo" }}>
        Los enlaces para restablecer la contraseña vencen en 1 hora y solo funcionan una vez.
      </EmptyState>
    );
  }

  return (
    <>
      <h1 className="font-display text-title">Elige tu contraseña nueva</h1>
      <p className="mb-8 mt-2 text-grafito">Al guardarla, cerramos las sesiones abiertas en otros dispositivos.</p>
      <ResetForm token={token} />
    </>
  );
}
