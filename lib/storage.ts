import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";

/**
 * Almacenamiento de fotos.
 * - Con BLOB_READ_WRITE_TOKEN: Vercel Blob (el navegador sube directo, ver app/api/fotos).
 * - Sin token y fuera de producción: carpeta local `.uploads/` para poder probar en la Mac.
 */

export type StorageMode = "blob" | "local";

export function storageMode(): StorageMode {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  if (process.env.NODE_ENV === "production") {
    throw new Error("Falta BLOB_READ_WRITE_TOKEN: conecta un store de Vercel Blob al proyecto");
  }
  return "local";
}

const LOCAL_DIR = join(process.cwd(), ".uploads");
export const LOCAL_URL_PREFIX = "/api/fotos/local/";

/** Ruta dentro del almacenamiento para una foto de solicitud. Siempre bajo la carpeta del vendedor y la pieza. */
export function requestPhotoPrefix(userId: string, productId: string): string {
  return `solicitudes/${userId}/${productId}/`;
}

function safeLocalPath(pathname: string): string {
  const full = normalize(join(LOCAL_DIR, pathname));
  if (!full.startsWith(LOCAL_DIR + "/")) throw new Error("Ruta inválida");
  return full;
}

export async function saveLocal(pathname: string, data: Buffer): Promise<string> {
  const full = safeLocalPath(pathname);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, data);
  return LOCAL_URL_PREFIX + pathname;
}

export async function readLocal(pathname: string): Promise<Buffer | null> {
  try {
    return await readFile(safeLocalPath(pathname));
  } catch {
    return null;
  }
}

/** Confirma que la URL de una foto pertenece a nuestro almacenamiento y a la ruta esperada. */
export function isOwnedPhotoUrl(url: string, pathname: string, expectedPrefix: string): boolean {
  if (!pathname.startsWith(expectedPrefix) || pathname.includes("..")) return false;
  if (url.startsWith(LOCAL_URL_PREFIX)) return url === LOCAL_URL_PREFIX + pathname;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com") && decodeURIComponent(u.pathname) === `/${pathname}`;
  } catch {
    return false;
  }
}

/** Bytes de una foto para mandarla a la IA cuando no es accesible públicamente (modo local). */
export async function photoBytes(url: string): Promise<Buffer | null> {
  if (url.startsWith(LOCAL_URL_PREFIX)) return readLocal(url.slice(LOCAL_URL_PREFIX.length));
  return null;
}
