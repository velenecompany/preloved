import "server-only";
import { headers } from "next/headers";

/** IP del visitante según Vercel (primer valor de x-forwarded-for). */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || null;
  return h.get("x-real-ip");
}
