import type { Metadata } from "next";
import Link from "next/link";
import { requireRole, STAFF_ROLES } from "@/lib/auth/session";
import { sellerStatus } from "@/lib/consignment/labels";
import { describeSlot, INTAKE_METHOD_LABEL } from "@/lib/domain/inventory";
import { formatMXN } from "@/lib/domain/money";
import { getIntakeOptions, listStage, stageCounts, STAGES, type Stage } from "@/lib/inventory/service";

export const metadata: Metadata = { title: "Inventario" };
export const dynamic = "force-dynamic";

export default async function InventoryPage(props: { searchParams: Promise<{ etapa?: string }> }) {
  const searchParams = await props.searchParams;
  await requireRole(STAFF_ROLES, "/admin/inventario");
  const stage: Stage = searchParams.etapa && searchParams.etapa in STAGES ? (searchParams.etapa as Stage) : "por_recibir";
  const [counts, rows, options] = await Promise.all([stageCounts(), listStage(stage), getIntakeOptions()]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">Inventario</h2>
        <p className="mt-1 text-grafito">De la oferta aceptada a la pieza publicada.</p>
      </div>

      <nav aria-label="Etapas" className="flex flex-wrap gap-x-6 gap-y-2 border-b border-linea pb-3 text-sm">
        {(Object.keys(STAGES) as Stage[]).map((s) => (
          <Link
            key={s}
            href={`/admin/inventario?etapa=${s}`}
            aria-current={s === stage ? "page" : undefined}
            className={s === stage ? "font-medium text-tinta underline underline-offset-8" : "text-grafito hover:text-tinta"}
          >
            {STAGES[s].label} ({counts[s]})
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="border border-dashed border-linea px-6 py-10 text-center text-grafito">No hay piezas en esta etapa.</p>
      ) : (
        <ul className="divide-y divide-linea border-y border-linea">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/inventario/${r.id}`} className="grid grid-cols-[4.5rem_1fr] gap-4 py-4 hover:bg-white sm:grid-cols-[4.5rem_1fr_14rem_8rem]">
                <div className="h-[4.5rem] w-[4.5rem] bg-muro">
                  {r.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.cover_url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium">
                    {r.brand_name} {r.sku && <span className="ml-1 text-xs font-normal text-piedra">{r.sku}</span>}
                  </p>
                  <p className="truncate text-sm text-grafito">{r.model}</p>
                  <p className="mt-1 truncate text-xs text-piedra">
                    {r.seller_name ?? r.seller_email}, {r.category_name}
                  </p>
                </div>
                <div className="col-start-2 text-sm sm:col-start-auto">
                  {r.plan_method ? (
                    <>
                      <p>{INTAKE_METHOD_LABEL[r.plan_method]}</p>
                      <p className="text-xs text-piedra">
                        {r.plan_scheduled_for
                          ? describeSlot(options, r.plan_method, new Date(r.plan_scheduled_for))
                          : r.plan_tracking
                            ? `Guía ${r.plan_tracking}`
                            : "Sin guía todavía"}
                      </p>
                    </>
                  ) : (
                    <p className="text-grafito">{stage === "por_recibir" ? "Sin entrega agendada" : sellerStatus(r.status).label}</p>
                  )}
                </div>
                <p className="col-start-2 text-sm sm:col-start-auto sm:text-right">{r.price_cents ? formatMXN(Number(r.price_cents)) : ""}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
