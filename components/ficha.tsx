import type { ReactNode } from "react";

/**
 * La ficha de la pieza: una etiqueta de consignación con su perforación.
 * Es el elemento de identidad del sitio; aparece en el inicio (como proceso)
 * y en cada producto (con el expediente real de la pieza).
 */
export function FichaShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative bg-white pl-12 pr-6 py-6 shadow-[0_1px_0_var(--color-linea),0_18px_40px_-28px_rgba(0,0,0,0.35)] ${className}`}>
      <span
        aria-hidden
        className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border border-linea bg-papel"
      />
      <span aria-hidden className="absolute bottom-0 left-10 top-0 border-l border-dashed border-linea" />
      {children}
    </div>
  );
}

export interface FichaRow {
  label: string;
  value: ReactNode;
  verified?: boolean;
}

export function FichaRows({ rows }: { rows: FichaRow[] }) {
  return (
    <dl className="divide-y divide-linea">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[minmax(0,9rem)_1fr] gap-4 py-2.5 text-sm">
          <dt className="text-piedra">{row.label}</dt>
          <dd className={row.verified ? "font-medium text-sello" : ""}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
