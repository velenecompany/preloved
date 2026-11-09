import { NextResponse } from "next/server";
import { storageMode } from "@/lib/storage";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    return NextResponse.json({ mode: storageMode() });
  } catch (e) {
    return NextResponse.json({ mode: null, error: (e as Error).message }, { status: 503 });
  }
}
