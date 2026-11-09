import type { Metadata } from "next";
import Link from "next/link";
import { getPayoutAccount } from "@/lib/auth/service";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/domain/labels";
import { site } from "@/config/site";
import { PayoutForm } from "../forms";

export const metadata: Metadata = { title: "Datos bancarios" };

export default async function PayoutPage() {
  const user = await requireUser("/cuenta/datos-bancarios");
  const payout = await getPayoutAccount(user.id);

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_20rem]">
      <section className="max-w-md">
        <h2 className="font-display text-2xl">Datos bancarios</h2>
        <p className="mb-8 mt-2 text-grafito">
          Cuando se vende tu pieza y termina la ventana de 72 horas del comprador, te transferimos por SPEI a esta cuenta ese mismo día.
        </p>
        {user.emailVerified ? (
          <PayoutForm
            initial={
              payout
                ? { holderName: payout.holder_name, clabe: payout.clabe, bankName: payout.bank_name, rfc: payout.rfc ?? "" }
                : null
            }
          />
        ) : (
          <div className="border border-linea bg-white px-5 py-5 text-sm">
            <p className="font-medium">Primero confirma tu correo.</p>
            <p className="mt-1 text-grafito">
              Así protegemos a dónde se envía tu dinero.{" "}
              <Link href="/cuenta" className="underline underline-offset-4">Reenviar el enlace desde tu cuenta</Link>.
            </p>
          </div>
        )}
      </section>

      <aside className="space-y-4 text-sm text-grafito md:border-l md:border-linea md:pl-8">
        {payout && (
          <p>
            Última actualización: {formatDate(payout.updated_at)}.{" "}
            {payout.verified_at ? <span className="text-sello">Verificada por {site.name}.</span> : "Pendiente de verificar en tu primera liquidación."}
          </p>
        )}
        <p>Debe ser una cuenta a tu nombre. No pagamos a cuentas de terceros.</p>
        <p>Cada vez que cambias la CLABE te pedimos tu contraseña y te avisamos por correo.</p>
        <p>
          Tus datos bancarios se usan solo para pagarte. Consulta el{" "}
          <Link href="/legal/privacidad" className="underline underline-offset-4">aviso de privacidad</Link>.
        </p>
      </aside>
    </div>
  );
}
