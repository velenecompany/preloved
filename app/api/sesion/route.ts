import { NextResponse } from "next/server";
import { getCurrentUser, isStaff } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Estado mínimo de la sesión para el header. Permite que las páginas públicas sigan siendo estáticas. */
export async function GET() {
  const user = await getCurrentUser().catch(() => null);
  return NextResponse.json(
    user ? { user: { firstName: user.fullName?.split(" ")[0] ?? null, staff: isStaff(user) } } : { user: null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
