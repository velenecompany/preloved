import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canUploadPhoto, isUuid } from "@/lib/consignment/service";
import { requestPhotoPrefix, saveLocal, storageMode } from "@/lib/storage";

/** Subida local para desarrollo, cuando no hay Vercel Blob configurado. En producción no existe. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" || storageMode() !== "local") {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión para subir fotos" }, { status: 401 });

  const form = await request.formData();
  const productId = String(form.get("productId") ?? "");
  const file = form.get("file");
  if (!isUuid(productId) || !(file instanceof Blob)) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return NextResponse.json({ error: "Formato no permitido" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "La foto pesa más de 8 MB" }, { status: 400 });
  if (!(await canUploadPhoto(user.id, productId))) return NextResponse.json({ error: "Esta solicitud ya no acepta fotos" }, { status: 400 });

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const pathname = `${requestPhotoPrefix(user.id, productId)}${randomBytes(8).toString("hex")}.${ext}`;
  const url = await saveLocal(pathname, Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ url, pathname });
}
