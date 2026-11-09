import { NextResponse } from "next/server";
import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { readLocal } from "@/lib/storage";

/** Sirve las fotos guardadas en local (solo desarrollo). Solo el dueño o el personal pueden verlas. */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const user = await getCurrentUser();
  const pathname = (await params).path.join("/");
  const owner = pathname.split("/")[1];
  if (!user || (user.id !== owner && !isStaff(user))) return new NextResponse(null, { status: 404 });

  const data = await readLocal(pathname);
  if (!data) return new NextResponse(null, { status: 404 });
  const type = pathname.endsWith(".png") ? "image/png" : pathname.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" } });
}
