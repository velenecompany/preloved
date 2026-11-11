"use client";

import { upload } from "@vercel/blob/client";

const MAX_SIDE = 2000;
const QUALITY = 0.85;

/** Reduce la foto en el navegador antes de subirla: lado mayor de 2000 px, JPEG. Ahorra datos móviles. */
export async function compressImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("No pudimos leer esa imagen. Usa una foto en JPG o PNG.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no permite procesar la imagen.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("No pudimos preparar la foto.");
  return blob;
}

let cachedMode: Promise<"blob" | "local"> | null = null;

function storageMode(): Promise<"blob" | "local"> {
  cachedMode ??= fetch("/api/fotos/modo")
    .then((r) => r.json())
    .then((d: { mode: "blob" | "local" | null; error?: string }) => {
      if (!d.mode) throw new Error(d.error ?? "El almacenamiento de fotos no está configurado");
      return d.mode;
    })
    .catch((e) => {
      cachedMode = null;
      throw e;
    });
  return cachedMode;
}

export type UploadScope = "solicitud" | "inventario";

/**
 * Sube una foto ya comprimida y devuelve su URL y ruta dentro del almacenamiento.
 * - solicitud: fotos del vendedor, en su carpeta.
 * - inventario: fotos del equipo (recepción, evidencia, finales), en la carpeta de la pieza.
 */
export async function uploadPhoto(blob: Blob, userId: string, productId: string, scope: UploadScope = "solicitud"): Promise<{ url: string; pathname: string }> {
  const mode = await storageMode();
  if (mode === "blob") {
    const path = scope === "inventario" ? `inventario/${productId}/foto.jpg` : `solicitudes/${userId}/${productId}/foto.jpg`;
    const result = await upload(path, blob, {
      access: "public",
      handleUploadUrl: "/api/fotos/subir",
      clientPayload: JSON.stringify({ productId, scope }),
      contentType: "image/jpeg",
    });
    return { url: result.url, pathname: result.pathname };
  }
  const form = new FormData();
  form.append("productId", productId);
  form.append("scope", scope);
  form.append("file", blob, "foto.jpg");
  const res = await fetch("/api/fotos/local", { method: "POST", body: form });
  const data = (await res.json()) as { url?: string; pathname?: string; error?: string };
  if (!res.ok || !data.url || !data.pathname) throw new Error(data.error ?? "No se pudo subir la foto");
  return { url: data.url, pathname: data.pathname };
}
