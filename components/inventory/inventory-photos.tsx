"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { registerInventoryPhotoAction, removeInventoryPhotoAction } from "@/app/admin/inventario/actions";
import { compressImage, uploadPhoto } from "@/components/consignment/upload";

interface Props {
  productId: string;
  userId: string;
  kind: "recepcion" | "defecto" | "final";
  label: string;
  hint: string;
  photos: { id: string; url: string }[];
  editable: boolean;
}

/** Fotos que toma el equipo: cómo llegó la pieza, evidencia de defectos y fotos finales de la publicación. */
export function InventoryPhotos({ productId, userId, kind, label, hint, photos, editable }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const inputId = `inventario-${kind}`;

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files).slice(0, 12);
    try {
      for (let i = 0; i < list.length; i++) {
        setBusy(list.length > 1 ? `Subiendo ${i + 1} de ${list.length}…` : "Subiendo…");
        const blob = await compressImage(list[i]);
        const { url, pathname } = await uploadPhoto(blob, userId, productId, "inventario");
        const result = await registerInventoryPhotoAction(productId, kind, url, pathname);
        if (!result.ok) throw new Error(result.error);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
      startTransition(() => router.refresh());
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    setBusy("Quitando…");
    const result = await removeInventoryPhotoAction(productId, id);
    setBusy(null);
    if (!result.ok) setError(result.error ?? "No se pudo quitar la foto");
    startTransition(() => router.refresh());
  }

  return (
    <div className="border-b border-linea py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{label}</p>
        {photos.length > 0 && <p className="text-xs text-sello">{photos.length === 1 ? "1 foto" : `${photos.length} fotos`}</p>}
      </div>
      <p className="mt-0.5 text-sm text-grafito">{hint}</p>
      {photos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {photos.map((p) => (
            <li key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={label} className="h-28 w-28 bg-muro object-cover" />
              {editable && (
                <button
                  type="button"
                  onClick={() => handleRemove(p.id)}
                  disabled={busy !== null}
                  className="absolute right-1 top-1 bg-papel px-1.5 text-xs underline"
                  aria-label={`Quitar foto de ${label}`}
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="mt-3">
          <input
            ref={input}
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={busy !== null}
          />
          <label
            htmlFor={inputId}
            className={`inline-block cursor-pointer border border-tinta px-4 py-2 text-sm hover:bg-tinta hover:text-papel ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            {busy ?? (photos.length ? "Agregar fotos" : "Tomar o elegir fotos")}
          </label>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
