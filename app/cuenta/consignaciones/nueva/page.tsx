import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { activeRules, getAcceptedBrands, getEnabledCategories } from "@/lib/consignment/service";
import { EMPTY_PIECE, PieceForm } from "@/components/consignment/piece-form";
import { createDraftAction } from "../actions";

export const metadata: Metadata = { title: "Consignar una pieza" };

export default async function NewConsignmentPage() {
  const user = await requireUser("/cuenta/consignaciones/nueva");
  if (!user.emailVerified) redirect("/cuenta/consignaciones");

  const [categories, brands] = await Promise.all([getEnabledCategories(), getAcceptedBrands()]);
  const groups = [...new Set(categories.map((c) => c.commission_group))];
  const rules = (await Promise.all(groups.map(activeRules))).flat();

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-grafito">Paso 1 de 3</p>
      <h2 className="font-display text-2xl">Cuéntanos de la pieza</h2>
      <p className="mb-10 mt-2 text-grafito">
        Después te pedimos las fotos y una foto con un código para confirmar que la tienes. Puedes guardar y terminar más tarde.
      </p>
      <PieceForm
        action={createDraftAction}
        categories={categories}
        brands={brands}
        rules={rules}
        initial={EMPTY_PIECE}
        submitLabel="Guardar y seguir con las fotos"
        pendingLabel="Guardando…"
      />
    </div>
  );
}
