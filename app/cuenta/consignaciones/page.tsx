import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listSellerRequests } from "@/lib/consignment/service";
import { sellerStatus } from "@/lib/consignment/labels";
import { formatMXN } from "@/lib/domain/money";
import { EmptyState } from "@/components/notices";

export const metadata: Metadata = { title: "Mis consignaciones" };

const NOTICES: Record<string, string> = {
  retirada: "Retiramos tu solicitud.",
};

export default async function ConsignmentsPage(props: { searchParams: Promise<{ aviso?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await requireUser("/cuenta/consignaciones");
  const requests = await listSellerRequests(user.id);
  const notice = searchParams.aviso ? NOTICES[searchParams.aviso] : undefined;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl">Mis consignaciones</h2>
          <p className="mt-1 text-grafito">Cada pieza que nos propones y en qué va.</p>
        </div>
        {user.emailVerified && (
          <Link href="/cuenta/consignaciones/nueva" className="bg-tinta px-5 py-2.5 text-sm text-papel hover:bg-grafito">
            Consignar una pieza
          </Link>
        )}
      </div>

      {notice && <p role="status" className="border-l-2 border-tinta bg-white px-4 py-3 text-sm">{notice}</p>}

      {!user.emailVerified && (
        <p className="border border-linea bg-white px-5 py-4 text-sm">
          Confirma tu correo para consignar piezas. <Link href="/cuenta" className="underline underline-offset-4">Reenviar el enlace</Link>
        </p>
      )}

      {requests.length === 0 ? (
        user.emailVerified && (
          <EmptyState title="Todavía no has consignado nada" action={{ href: "/cuenta/consignaciones/nueva", label: "Consignar una pieza" }}>
            Te pedimos los datos de la pieza y unas fotos. Te respondemos con una propuesta de precio y comisión.
          </EmptyState>
        )
      ) : (
        <ul className="divide-y divide-linea border-y border-linea">
          {requests.map((r) => {
            const s = sellerStatus(r.status);
            return (
              <li key={r.id}>
                <Link href={`/cuenta/consignaciones/${r.id}`} className="grid grid-cols-[4.5rem_1fr] gap-4 py-4 hover:bg-white sm:grid-cols-[4.5rem_1fr_auto]">
                  <div className="h-[4.5rem] w-[4.5rem] bg-muro">
                    {r.cover_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.cover_url} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{r.brand_name}</p>
                    <p className="truncate text-sm text-grafito">{r.model}</p>
                    <p className="mt-1 text-sm">
                      <span className={r.status === "preaprobada" || r.status === "requiere_informacion" ? "font-medium" : ""}>{s.label}.</span>{" "}
                      <span className="text-grafito">{s.next}</span>
                    </p>
                  </div>
                  <p className="col-start-2 text-sm text-grafito sm:col-start-auto sm:text-right">
                    {r.offered_price_cents ? `Propuesta ${formatMXN(Number(r.offered_price_cents))}` : `Esperas ${formatMXN(Number(r.asking_price_cents))}`}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
