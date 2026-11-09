import type { Metadata } from "next";
import { EmptyState } from "@/components/notices";
import { consumeVerificationToken } from "@/lib/auth/service";

export const metadata: Metadata = { title: "Confirmar correo" };
export const dynamic = "force-dynamic";

export default async function VerifyPage(props: { searchParams: Promise<{ token?: string }> }) {
  const searchParams = await props.searchParams;
  const token = searchParams.token ?? "";
  const ok = token.length >= 20 && (await consumeVerificationToken(token));

  return ok ? (
    <EmptyState title="Tu correo quedó confirmado" action={{ href: "/cuenta", label: "Ir a mi cuenta" }}>
      Ya puedes registrar tus datos bancarios y consignar piezas.
    </EmptyState>
  ) : (
    <EmptyState title="Este enlace ya no sirve" action={{ href: "/cuenta", label: "Ir a mi cuenta" }}>
      Puede que ya lo hayas usado o que haya vencido. Desde tu cuenta puedes pedir uno nuevo.
    </EmptyState>
  );
}
