import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { safeRedirect } from "@/lib/auth/jwt";
import { LoginForm } from "../forms";

export const metadata: Metadata = { title: "Ingresar" };

export default async function LoginPage({ searchParams }: { searchParams: { siguiente?: string } }) {
  const siguiente = searchParams.siguiente ? safeRedirect(searchParams.siguiente) : undefined;
  if (await getCurrentUser()) redirect(siguiente ?? "/cuenta");

  return (
    <>
      <h1 className="font-display text-title">Ingresar</h1>
      <p className="mb-8 mt-2 text-grafito">
        ¿No tienes cuenta?{" "}
        <Link href={siguiente ? `/registro?siguiente=${encodeURIComponent(siguiente)}` : "/registro"} className="text-tinta underline underline-offset-4">
          Crea una
        </Link>
      </p>
      <LoginForm siguiente={siguiente} />
    </>
  );
}
