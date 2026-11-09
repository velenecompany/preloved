import type { Metadata } from "next";
import Link from "next/link";
import { getPayoutAccount } from "@/lib/auth/service";
import { requireUser, type Role } from "@/lib/auth/session";
import { maskClabe } from "@/lib/domain/banks";
import { ChangePasswordForm, ProfileForm, ResendVerificationForm } from "./forms";

export const metadata: Metadata = { title: "Mi cuenta" };

const NOTICES: Record<string, string> = {
  bienvenida: "Tu cuenta está lista. Te enviamos un correo para confirmar tu dirección.",
  "contrasena-restablecida": "Guardamos tu contraseña nueva y cerramos las sesiones en otros dispositivos.",
  "sin-permiso": "No tienes permiso para entrar a esa sección.",
};

const ROLE_LABEL: Record<Role, string> = {
  comprador: "Comprador",
  vendedor: "Vendedor",
  admin: "Administrador",
  autenticador: "Autenticador",
  operaciones: "Operaciones",
  finanzas: "Finanzas",
};

export default async function AccountPage(props: { searchParams: Promise<{ aviso?: string }> }) {
  const searchParams = await props.searchParams;
  const user = await requireUser();
  const payout = await getPayoutAccount(user.id);
  const notice = searchParams.aviso ? NOTICES[searchParams.aviso] : undefined;

  return (
    <div className="space-y-14">
      {notice && <p role="status" className="border-l-2 border-tinta bg-white px-4 py-3 text-sm">{notice}</p>}

      <section className="grid gap-8 md:grid-cols-[14rem_1fr]">
        <div>
          <h2 className="font-display text-2xl">Correo</h2>
        </div>
        <div className="space-y-3">
          <p>
            {user.email}{" "}
            <span className={user.emailVerified ? "text-sello" : "text-grafito"}>
              ({user.emailVerified ? "confirmado" : "sin confirmar"})
            </span>
          </p>
          {!user.emailVerified && (
            <>
              <p className="text-sm text-grafito">Confirma tu correo para registrar tus datos bancarios y consignar piezas.</p>
              <ResendVerificationForm />
            </>
          )}
          <p className="text-sm text-grafito">Tipo de cuenta: {user.roles.map((r) => ROLE_LABEL[r]).join(", ")}</p>
        </div>
      </section>

      <section className="grid gap-8 border-t border-linea pt-12 md:grid-cols-[14rem_1fr]">
        <div>
          <h2 className="font-display text-2xl">Vender</h2>
        </div>
        <div className="space-y-3">
          {payout ? (
            <>
              <p>
                Te pagamos en {payout.bank_name}, CLABE {maskClabe(payout.clabe)}.
              </p>
              <Link href="/cuenta/datos-bancarios" className="text-sm underline underline-offset-4">
                Cambiar datos bancarios
              </Link>
            </>
          ) : (
            <>
              <p className="text-grafito">Para consignar piezas necesitamos saber a qué cuenta pagarte cuando se vendan.</p>
              <Link href="/cuenta/datos-bancarios" className="inline-block border border-tinta px-5 py-2.5 text-sm hover:bg-tinta hover:text-papel">
                Registrar datos bancarios
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="grid gap-8 border-t border-linea pt-12 md:grid-cols-[14rem_1fr]">
        <div>
          <h2 className="font-display text-2xl">Tus datos</h2>
        </div>
        <div className="max-w-md">
          <ProfileForm fullName={user.fullName ?? ""} phone={user.phone ?? ""} />
        </div>
      </section>

      <section className="grid gap-8 border-t border-linea pt-12 md:grid-cols-[14rem_1fr]">
        <div>
          <h2 className="font-display text-2xl">Contraseña</h2>
        </div>
        <div className="max-w-md">
          <ChangePasswordForm />
        </div>
      </section>
    </div>
  );
}
