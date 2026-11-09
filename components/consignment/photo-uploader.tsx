"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { PhotoSlot } from "@/lib/domain/photo-guide";
import { registerPhotoAction, removePhotoAction } from "@/app/cuenta/consignaciones/actions";
import { compressImage, uploadPhoto } from "./upload";

export interface UploadedPhoto {
  id: string;
  url: string;
  slot: string | null;
}

interface SlotProps {
  productId: string;
  userId: string;
  slot: PhotoSlot;
  photos: UploadedPhoto[];
  editable: boolean;
}

export function PhotoSlotField({ productId, userId, slot, photos, editable }: SlotProps) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const canAddMore = slot.multiple || photos.length === 0;

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files).slice(0, slot.multiple ? 6 : 1);
    try {
      for (let i = 0; i < list.length; i++) {
        setBusy(list.length > 1 ? `Subiendo ${i + 1} de ${list.length}…` : "Subiendo…");
        const blob = await compressImage(list[i]);
        const { url, pathname } = await uploadPhoto(blob, userId, productId);
        const result = await registerPhotoAction(productId, slot.slot, url, pathname);
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
    const result = await removePhotoAction(productId, id);
    setBusy(null);
    if (!result.ok) setError(result.error ?? "No se pudo quitar la foto");
    startTransition(() => router.refresh());
  }

  return (
    <div className="border-b border-linea py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">
          {slot.label}
          {slot.required && <span className="ml-2 text-xs font-normal text-grafito">obligatoria</span>}
        </p>
        {photos.length > 0 && <p className="text-xs text-sello">{photos.length === 1 ? "1 foto" : `${photos.length} fotos`}</p>}
      </div>
      <p className="mt-0.5 text-sm text-grafito">{slot.hint}</p>

      {photos.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {photos.map((p) => (
            <li key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={slot.label} className="h-24 w-24 bg-muro object-cover" />
              {editable && (
                <button
                  type="button"
                  onClick={() => handleRemove(p.id)}
                  disabled={busy !== null}
                  className="absolute right-1 top-1 bg-papel px-1.5 text-xs underline"
                  aria-label={`Quitar foto de ${slot.label}`}
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && canAddMore && (
        <div className="mt-3">
          <input
            ref={input}
            id={`foto-${slot.slot}`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            multiple={slot.multiple}
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
            disabled={busy !== null}
          />
          <label
            htmlFor={`foto-${slot.slot}`}
            className={`inline-block cursor-pointer border border-tinta px-4 py-2 text-sm hover:bg-tinta hover:text-papel ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            {busy ?? (photos.length ? "Agregar otra foto" : "Tomar o elegir foto")}
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
