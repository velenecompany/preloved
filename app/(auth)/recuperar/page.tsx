import type { Metadata } from "next";
import Link from "next/link";
import { RecoverForm } from "../forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  return (
    <>
      <h1 className="font-display text-title">Recuperar contraseña</h1>
      <p className="mb-8 mt-2 text-grafito">Te enviamos un enlace para elegir una contraseña nueva. Vence en 1 hora.</p>
      <RecoverForm />
      <Link href="/ingresar" className="mt-8 inline-block text-sm underline underline-offset-4">
        Volver a ingresar
      </Link>
    </>
  );
}
