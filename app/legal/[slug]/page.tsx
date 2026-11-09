import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLegalPage, LEGAL_PAGES } from "@/content/legal";

type Params = { slug: string };

export function generateStaticParams() {
  return LEGAL_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = getLegalPage(params.slug);
  return { title: page?.title ?? "Política" };
}

export default async function LegalPage({ params }: { params: Params }) {
  const page = getLegalPage(params.slug);
  if (!page) notFound();
  const showReview = process.env.NEXT_PUBLIC_SHOW_LEGAL_REVIEW_NOTES !== "false";

  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-8">
      <p className="mb-6 border border-linea bg-white px-4 py-3 text-sm text-grafito">
        Borrador sujeto a revisión legal. No constituye la versión definitiva de esta política.
      </p>
      <h1 className="font-display text-title">{page.title}</h1>
      <p className="mt-2 text-grafito">{page.summary}</p>
      <div className="mt-10 space-y-10">
        {page.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="mb-3 text-lg font-medium">{s.heading}</h2>
            <div className="space-y-3 text-grafito">
              {s.body.map((b) => (
                <p key={b} className="max-w-[68ch]">{b}</p>
              ))}
            </div>
            {showReview && s.review && (
              <p className="mt-3 border-l-2 border-tinta pl-3 text-sm">
                <span className="font-medium">Pendiente de revisión legal: </span>
                {s.review}
              </p>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}
