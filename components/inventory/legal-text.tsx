/** Muestra el texto de un documento legal guardado en Markdown simple (## títulos y párrafos). */
export function LegalText({ body }: { body: string }) {
  const blocks = body.split("\n").filter((l) => l.trim() !== "");
  return (
    <div className="space-y-3 text-sm leading-relaxed text-grafito">
      {blocks.map((line, i) =>
        line.startsWith("## ") ? (
          <h4 key={i} className="pt-2 font-medium text-tinta">
            {line.slice(3)}
          </h4>
        ) : (
          <p key={i}>{line}</p>
        ),
      )}
    </div>
  );
}
