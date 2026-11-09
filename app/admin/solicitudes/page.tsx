import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { listRequestsForReview } from "@/lib/consignment/service";
import { formatMXN } from "@/lib/domain/money";
import { formatScore } from "@/lib/domain/labels";

export const metadata: Metadata = { title: "Solicitudes de consignación" };

const NOTICES: Record<string, string> = {
  preaprobada: "Enviamos la propuesta al vendedor.",
  requiere_informacion: "Le pedimos más información al vendedor.",
  rechazada: "Rechazamos la solicitud y avisamos al vendedor.",
};

function waiting(since: Date | null | undefined): string {
  if (!since) return "";
  const hours = Math.floor((Date.now() - new Date(since).getTime()) / 3_600_000);
  if (hours < 1) return "hace menos de 1 hora";
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? "día" : "días"}`;
}

export default async function RequestsPage(props: { searchParams: Promise<{ aviso?: string }> }) {
  const searchParams = await props.searchParams;
  await requireRole(["admin", "autenticador"], "/admin/solicitudes");
  const requests = await listRequestsForReview();
  const notice = searchParams.aviso ? NOTICES[searchParams.aviso] : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">Solicitudes por revisar</h2>
        <p className="mt-1 text-grafito">Las más antiguas primero.</p>
      </div>
      {notice && <p role="status" className="border-l-2 border-tinta bg-white px-4 py-3 text-sm">{notice}</p>}

      {requests.length === 0 ? (
        <p className="border border-dashed border-linea px-6 py-10 text-center text-grafito">No hay solicitudes pendientes.</p>
      ) : (
        <ul className="divide-y divide-linea border-y border-linea">
          {requests.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/solicitudes/${r.id}`} className="grid grid-cols-[4.5rem_1fr] gap-4 py-4 hover:bg-white sm:grid-cols-[4.5rem_1fr_10rem_8rem]">
                <div className="h-[4.5rem] w-[4.5rem] bg-muro">
                  {r.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.cover_url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{r.brand_name}</p>
                  <p className="truncate text-sm text-grafito">{r.model}</p>
                  <p className="mt-1 truncate text-xs text-piedra">
                    {r.seller_name ?? r.seller_email}, {r.category_name}, {r.photo_count} fotos
                  </p>
                </div>
                <div className="col-start-2 text-sm sm:col-start-auto">
                  <p>Espera {formatMXN(Number(r.asking_price_cents))}</p>
                  <p className="text-xs text-piedra">Enviada {waiting(r.submitted_at)}</p>
                </div>
                <p className="col-start-2 text-sm text-grafito sm:col-start-auto sm:text-right">
                  {r.ai_score ? `IA ${formatScore(Number(r.ai_score))}/10` : "Sin lectura IA"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
