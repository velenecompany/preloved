"use client";

import { useActionState, useMemo, useState } from "react";
import { Field, FormMessage, initialFormState, keepValuesOnSubmit, SubmitButton, type FormState } from "@/components/form";
import { computeCommission, findRule, type CommissionRule } from "@/lib/domain/commissions";
import { formatMXN, pesosToCents } from "@/lib/domain/money";
import { DECLARED_CONDITION_LABEL, FIT_LABEL, INCLUDED_ITEM_LABEL } from "@/lib/domain/labels";
import { DECLARED_CONDITIONS, FITS, INCLUDED_ITEMS, SIZE_SYSTEMS } from "@/lib/consignment/schemas";

export interface PieceFormValues {
  categorySlug: string;
  brandSlug: string;
  brandName: string;
  model: string;
  sizeLabel: string;
  sizeSystem: string;
  fit: string;
  declaredCondition: string;
  includes: string[];
  description: string;
  askingPrice: string;
}

export const EMPTY_PIECE: PieceFormValues = {
  categorySlug: "",
  brandSlug: "",
  brandName: "",
  model: "",
  sizeLabel: "",
  sizeSystem: "",
  fit: "",
  declaredCondition: "",
  includes: [],
  description: "",
  askingPrice: "",
};

interface Props {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  categories: { slug: string; name: string; commission_group: string }[];
  brands: { slug: string; name: string }[];
  rules: CommissionRule[];
  initial: PieceFormValues;
  submitLabel: string;
  pendingLabel: string;
}

const selectClass = "w-full border border-linea bg-white px-3 py-2.5 text-base focus:border-tinta focus:outline-none";

export function PieceForm({ action, categories, brands, rules, initial, submitLabel, pendingLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  const [category, setCategory] = useState(initial.categorySlug);
  const [brand, setBrand] = useState(initial.brandSlug || (initial.brandName ? "otra" : ""));
  const [price, setPrice] = useState(initial.askingPrice);
  const e = state.fieldErrors ?? {};

  const estimate = useMemo(() => {
    const group = categories.find((c) => c.slug === category)?.commission_group;
    const pesos = Number(price.replace(/[$,\s]/g, ""));
    if (!group || !Number.isFinite(pesos) || pesos < 500) return null;
    try {
      const cents = pesosToCents(Math.round(pesos));
      return computeCommission(cents, findRule(rules, group, cents));
    } catch {
      return null;
    }
  }, [category, price, categories, rules]);

  return (
    <form onSubmit={keepValuesOnSubmit(formAction)} className="space-y-8" noValidate>
      <FormMessage state={state} />

      <fieldset>
        <legend className="mb-3 font-medium">Categoría</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {categories.map((c) => (
            <label
              key={c.slug}
              className={`cursor-pointer border px-3 py-3 text-sm ${category === c.slug ? "border-tinta bg-white" : "border-linea hover:border-grafito"}`}
            >
              <input
                type="radio"
                name="categorySlug"
                value={c.slug}
                checked={category === c.slug}
                onChange={() => setCategory(c.slug)}
                className="sr-only"
              />
              {c.name}
            </label>
          ))}
        </div>
        {e.categorySlug && <p className="mt-1.5 text-sm">{e.categorySlug}</p>}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="brandSlug" className="mb-1.5 block text-sm font-medium">
            Marca
          </label>
          <select id="brandSlug" name="brandSlug" value={brand} onChange={(ev) => setBrand(ev.target.value)} className={selectClass}>
            <option value="">Elige la marca</option>
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
            <option value="otra">Otra marca…</option>
          </select>
          {e.brand && <p className="mt-1.5 text-sm">{e.brand}</p>}
        </div>
        {brand === "otra" && (
          <Field label="Nombre de la marca" name="brandName" defaultValue={initial.brandName} hint="La revisamos antes de aceptar la pieza." />
        )}
      </div>

      <Field
        label="Modelo o nombre de la pieza"
        name="model"
        defaultValue={initial.model}
        error={e.model}
        hint="Por ejemplo: Air Jordan 1 High Chicago, Neverfull MM, chamarra de piel."
      />

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Talla" name="sizeLabel" defaultValue={initial.sizeLabel} error={e.sizeLabel} hint="Déjala vacía si no aplica." />
        <div>
          <label htmlFor="sizeSystem" className="mb-1.5 block text-sm font-medium">
            Sistema de talla
          </label>
          <select id="sizeSystem" name="sizeSystem" defaultValue={initial.sizeSystem} className={selectClass}>
            <option value="">No aplica</option>
            {SIZE_SYSTEMS.map((s) => (
              <option key={s} value={s}>
                {s === "UNICA" ? "Talla única" : s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fit" className="mb-1.5 block text-sm font-medium">
            Ajuste
          </label>
          <select id="fit" name="fit" defaultValue={initial.fit} className={selectClass}>
            <option value="">No aplica</option>
            {FITS.map((f) => (
              <option key={f} value={f}>
                {FIT_LABEL[f]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="mb-3 font-medium">¿En qué condición está?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {DECLARED_CONDITIONS.map((c) => (
            <label key={c} className="flex items-center gap-3 border border-linea bg-white px-3 py-2.5 text-sm has-[:checked]:border-tinta">
              <input type="radio" name="declaredCondition" value={c} defaultChecked={initial.declaredCondition === c} className="accent-tinta" />
              {DECLARED_CONDITION_LABEL[c]}
            </label>
          ))}
        </div>
        {e.declaredCondition && <p className="mt-1.5 text-sm">{e.declaredCondition}</p>}
      </fieldset>

      <fieldset>
        <legend className="mb-1 font-medium">¿Qué incluye?</legend>
        <p className="mb-3 text-sm text-grafito">Una caja o un ticket ayudan, pero no sustituyen la autenticación física.</p>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {INCLUDED_ITEMS.map((i) => (
            <label key={i} className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="includes" value={i} defaultChecked={initial.includes.includes(i)} className="accent-tinta" />
              {INCLUDED_ITEM_LABEL[i]}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="description" className="mb-1.5 block text-sm font-medium">
          Descripción (opcional)
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={1500}
          defaultValue={initial.description}
          placeholder="Cuándo y dónde la compraste, cuántas veces la usaste, cualquier detalle que debamos saber."
          className="w-full border border-linea bg-white px-3 py-2.5 text-base focus:border-tinta focus:outline-none"
        />
        {e.description && <p className="mt-1.5 text-sm">{e.description}</p>}
      </div>

      <div className="max-w-xs">
        <Field
          label="Precio que esperas, en pesos"
          name="askingPrice"
          inputMode="numeric"
          value={price}
          onChange={(ev) => setPrice(ev.target.value)}
          error={e.askingPriceCents}
          placeholder="8000"
        />
        {estimate && (
          <p className="mt-2 text-sm text-grafito">
            Si se vende en {formatMXN(estimate.salePriceCents)}, la comisión es de {formatMXN(estimate.commissionCents)} (
            {estimate.rateBps / 100} %) y tú recibirías {formatMXN(estimate.sellerGrossCents)}.
          </p>
        )}
      </div>

      <SubmitButton pendingLabel={pendingLabel} pending={pending}>{submitLabel}</SubmitButton>
    </form>
  );
}
