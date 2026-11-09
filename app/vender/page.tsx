import type { Metadata } from "next";
import Link from "next/link";
import { whatsappLink } from "@/config/site";

export const metadata: Metadata = { title: "Vender" };

const RULES = [
  {
    group: "Bolsos, ropa de lujo y accesorios",
    rows: [
      ["Hasta $10,999", "30 %"],
      ["$11,000 a $59,999", "20 %"],
      ["Desde $60,000", "15 %"],
    ],
  },
  {
    group: "Sneakers y streetwear",
    rows: [
      ["Hasta $10,999", "18 %"],
      ["$11,000 a $59,999", "15 %"],
      ["Desde $60,000", "12 %"],
    ],
  },
];

export default function SellPage() {
  const contact = whatsappLink("Hola, quiero consignar una pieza. Les comparto fotos y el precio que espero.");

  return (
    <div className="mx-auto max-w-5xl px-4 py-14 sm:px-8">
      <h1 className="max-w-3xl font-display text-display tracking-tight">
        Tu pieza se vende autenticada, y tú no haces nada más.
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-grafito">
        Recibimos la pieza, la autenticamos, la fotografiamos, la vendemos y la entregamos. Cuando el comprador la acepta, te pagamos por SPEI ese mismo día.
      </p>

      <section className="mt-16 grid gap-12 md:grid-cols-2" aria-labelledby="comisiones">
        <div>
          <h2 id="comisiones" className="font-display text-title">Comisiones</h2>
          <p className="mt-3 text-grafito">
            Se calculan sobre el precio final de venta y quedan fijas en tu contrato. La comisión del procesador de pagos la absorbemos nosotros.
          </p>
          <p className="mt-6 text-sm text-grafito">
            Ejemplo: un bolso que se vende en $8,000 paga $2,400 de comisión y tú recibes $5,600.
          </p>
        </div>
        <div className="space-y-8">
          {RULES.map((r) => (
            <table key={r.group} className="w-full text-sm">
              <caption className="mb-2 text-left font-medium">{r.group}</caption>
              <tbody>
                {r.rows.map(([range, pct]) => (
                  <tr key={range} className="border-b border-linea">
                    <td className="py-2 text-grafito">{range}</td>
                    <td className="py-2 text-right tabular-nums">{pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </section>

      <section className="mt-16 border-t border-linea pt-12" aria-labelledby="permanencia">
        <h2 id="permanencia" className="font-display text-title">Cómo funciona la consignación</h2>
        <div className="mt-8 grid gap-10 md:grid-cols-3">
          <div>
            <h3 className="font-medium">Un mes mínimo con nosotros</h3>
            <p className="mt-2 text-grafito">
              Desde que recibimos tu pieza, se queda en consignación al menos 30 días. Ese tiempo nos permite autenticarla, fotografiarla y darle exposición.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Si se vende, cobras ese día</h3>
            <p className="mt-2 text-grafito">
              El comprador tiene 72 horas desde que recibe la pieza para reportar un problema. En cuanto termina ese plazo, te transferimos por SPEI el mismo día.
            </p>
          </div>
          <div>
            <h3 className="font-medium">Después del mes, tú decides</h3>
            <p className="mt-2 text-grafito">
              Si no se ha vendido, puedes retirarla o dejarla publicada el tiempo que quieras. Mientras siga con nosotros, sigue a la venta.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-16 border-t border-linea pt-12" aria-labelledby="requisitos">
        <h2 id="requisitos" className="font-display text-title">Qué te vamos a pedir</h2>
        <ul className="mt-6 grid gap-x-10 gap-y-3 text-grafito md:grid-cols-2">
          <li>Fotos de frente, espalda, laterales, etiquetas interiores y, en calzado, suelas.</li>
          <li>Fotos claras de cualquier desgaste o defecto.</li>
          <li>Una foto de la pieza junto a un papel con el código que te damos al empezar, para confirmar que la tienes.</li>
          <li>Caja, bolsa protectora, tickets o certificados, si los tienes.</li>
        </ul>
        <div className="mt-10 flex flex-wrap items-center gap-6">
          <Link href="/cuenta/consignaciones/nueva" className="bg-tinta px-6 py-3 text-papel hover:bg-grafito">
            Consignar una pieza
          </Link>
          {contact && (
            <a href={contact} className="text-sm underline underline-offset-4">
              Prefiero escribir por WhatsApp
            </a>
          )}
          <Link href="/legal/vendedores" className="text-sm underline underline-offset-4">
            Política de vendedores
          </Link>
          <Link href="/legal/contrato-consignacion" className="text-sm underline underline-offset-4">
            Contrato de consignación
          </Link>
        </div>
      </section>
    </div>
  );
}
