import type { Metadata } from "next";
import Link from "next/link";
import { CONDITION_SCALE } from "@/lib/domain/labels";

export const metadata: Metadata = { title: "Autenticidad" };

export default function AuthenticityPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-8">
      <h1 className="max-w-3xl font-display text-display tracking-tight">
        Cómo revisamos cada pieza.
      </h1>

      <section className="mt-14 grid gap-12 md:grid-cols-3">
        <div>
          <h2 className="font-display text-2xl">Autenticación física</h2>
          <p className="mt-3 text-grafito">
            Revisamos materiales, costuras, herrajes, etiquetas, códigos de fecha y acabados con la pieza en la mano.
            Si el resultado no es concluyente, la pieza no se publica.
          </p>
        </div>
        <div>
          <h2 className="font-display text-2xl">Condición verificada</h2>
          <p className="mt-3 text-grafito">
            Una inteligencia artificial hace una lectura preliminar de las fotos de quien vende. La calificación que ves la confirma una persona después de inspeccionar la pieza.
          </p>
        </div>
        <div>
          <h2 className="font-display text-2xl">Lo que no prometemos</h2>
          <p className="mt-3 text-grafito">
            Una caja, un ticket o un certificado no prueban autenticidad por sí solos, y las fotos tampoco. Solo mostramos el sello de autenticación cuando la revisión física se hizo y se aprobó.
          </p>
        </div>
      </section>

      <section className="mt-16 border-t border-linea pt-12" aria-labelledby="escala">
        <h2 id="escala" className="font-display text-title">Escala de condición</h2>
        <dl className="mt-6 grid gap-x-12 sm:grid-cols-2">
          {Object.entries(CONDITION_SCALE)
            .sort(([a], [b]) => Number(b) - Number(a))
            .map(([n, label]) => (
              <div key={n} className="grid grid-cols-[2.5rem_1fr] border-b border-linea py-2.5">
                <dt className="tabular-nums">{n}</dt>
                <dd className="text-grafito">{label}</dd>
              </div>
            ))}
        </dl>
        <Link href="/legal/autenticidad" className="mt-8 inline-block text-sm underline underline-offset-4">
          Política de autenticidad completa
        </Link>
      </section>
    </div>
  );
}
