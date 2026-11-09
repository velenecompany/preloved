"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type SessionState = { user: { firstName: string | null; staff: boolean } | null } | undefined;

export function AccountLink() {
  const [session, setSession] = useState<SessionState>(undefined);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sesion", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((data) => !cancelled && setSession(data))
      .catch(() => !cancelled && setSession({ user: null }));
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Mientras carga, se reserva el espacio para que el header no salte.
  if (session === undefined) return <span className="inline-block w-16" aria-hidden />;

  return session.user ? (
    <Link href="/cuenta" className="underline-offset-4 hover:text-tinta hover:underline">
      Mi cuenta
    </Link>
  ) : (
    <Link href="/ingresar" className="underline-offset-4 hover:text-tinta hover:underline">
      Ingresar
    </Link>
  );
}
