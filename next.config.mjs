import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // La raíz del proyecto es esta carpeta (evita que Next tome otro package-lock.json de más arriba).
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  images: {
    remotePatterns: [
      // Fotos en Vercel Blob
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
    // Solo para revisar localmente con imágenes servidas en localhost; en Vercel queda apagado.
    unoptimized: process.env.NEXT_IMAGE_UNOPTIMIZED === "1",
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
