import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser, isStaff } from "@/lib/auth/session";
import { canUploadPhoto, isUuid } from "@/lib/consignment/service";
import { canStaffUpload, inventoryPhotoPrefix } from "@/lib/inventory/service";
import { requestPhotoPrefix } from "@/lib/storage";

/**
 * Emite el permiso para que el navegador suba una foto directo a Vercel Blob.
 * Solo el dueño de una solicitud editable puede subir, y solo dentro de su carpeta.
 * El registro en la base lo hace después la acción `registerPhotoAction`, que vuelve a validar todo.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const user = await getCurrentUser();
        if (!user) throw new Error("Inicia sesión para subir fotos");
        const { productId, scope } = JSON.parse(clientPayload ?? "{}") as { productId?: string; scope?: string };
        if (!productId || !isUuid(productId)) throw new Error("Solicitud inválida");
        if (scope === "inventario") {
          // Fotos del equipo: solo personal, solo en la carpeta de la pieza y solo en etapas que las aceptan.
          if (!isStaff(user)) throw new Error("No autorizado");
          if (!pathname.startsWith(inventoryPhotoPrefix(productId))) throw new Error("Ruta no permitida");
          if (!(await canStaffUpload(productId))) throw new Error("Esta pieza ya no acepta fotos");
        } else {
          if (!pathname.startsWith(requestPhotoPrefix(user.id, productId))) throw new Error("Ruta no permitida");
          if (!(await canUploadPhoto(user.id, productId))) throw new Error("Esta solicitud ya no acepta fotos");
        }
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
          maximumSizeInBytes: 8 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
