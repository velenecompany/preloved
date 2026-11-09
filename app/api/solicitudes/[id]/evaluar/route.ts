import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth/session";
import { aiConfigured, assessCondition } from "@/lib/consignment/ai";
import { isUuid } from "@/lib/consignment/service";

// La evaluación con IA puede tardar varios segundos; corre fuera de la acción de envío.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Inicia sesión" }, { status: 401 });
  if (!isUuid(params.id)) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  if (!aiConfigured()) return NextResponse.json({ skipped: "Falta GROQ_API_KEY" });

  const [p] = await query<{ seller_id: string; status: string; recent: string }>(
    `select seller_id, status,
       (select count(*) from condition_assessments a where a.product_id = p.id and a.source = 'ia' and a.created_at > now() - interval '10 minutes') as recent
     from products p where id = $1`,
    [params.id],
  );
  if (!p) return NextResponse.json({ error: "No existe" }, { status: 404 });

  const reviewer = hasRole(user, "admin", "autenticador");
  if (p.seller_id !== user.id && !reviewer) return NextResponse.json({ error: "No existe" }, { status: 404 });
  if (p.status !== "solicitud_enviada") return NextResponse.json({ error: "La solicitud no está en revisión" }, { status: 409 });
  // El vendedor dispara una sola evaluación al enviar; el equipo puede repetirla cuando quiera.
  if (!reviewer && Number(p.recent) > 0) return NextResponse.json({ skipped: "Ya evaluada" });

  const result = await assessCondition(params.id);
  if (!result.ok) {
    console.error(`Evaluación IA falló para ${params.id}: ${result.error}`);
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, score: result.assessment.calificacion });
}
