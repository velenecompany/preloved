import { NextResponse } from "next/server";
import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { readLocal } from "@/lib/storage";

/**
 * Sirve las fotos guardadas en local (solo desarrollo).
 * Fotos de solicitud: solo el dueño o el personal. Fotos de inventario: el personal, o cualquiera si es
 * una foto final de una pieza ya pública (en producción las sirve Vercel Blob).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  const pathname = (await params).path.join("/");
  if (pathname.startsWith("inventario/")) {
    if (!(user && isStaff(user))) {
      const rows = await query(
        `select 1 from product_images i join products p on p.id = i.product_id
         where i.pathname = $1 and i.kind in ('final', 'defecto') and is_public_status(p.status)`,
        [pathname],
      );
      if (!rows.length) return new NextResponse(null, { status: 404 });
    }
  } else {
    const owner = pathname.split("/")[1];
    if (!user || (user.id !== owner && !isStaff(user))) return new NextResponse(null, { status: 404 });
  }

  const data = await readLocal(pathname);
  if (!data) return new NextResponse(null, { status: 404 });
  const type = pathname.endsWith(".png") ? "image/png" : pathname.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" } });
}
