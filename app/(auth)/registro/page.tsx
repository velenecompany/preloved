import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { safeRedirect } from "@/lib/auth/jwt";
import { site } from "@/config/site";
import { RegisterForm } from "../forms";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function RegisterPage({ searchParams }: { searchParams: { siguiente?: string } }) {
  const siguiente = searchParams.siguiente ? safeRedirect(searchParams.siguiente) : undefined;
  if (await getCurrentUser()) redirect(siguiente ?? "/cuenta");

  return (
    <>
      <h1 className="font-display text-title">Crear cuenta</h1>
      <p className="mb-8 mt-2 text-grafito">
        Con tu cuenta puedes comprar y consignar piezas en {site.name}. ¿Ya tienes una?{" "}
        <Link href={siguiente ? `/ingresar?siguiente=${encodeURIComponent(siguiente)}` : "/ingresar"} className="text-tinta underline underline-offset-4">
          Ingresa
        </Link>
      </p>
      <RegisterForm siguiente={siguiente} />
    </>
  );
}
