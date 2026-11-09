import { EmptyState } from "@/components/notices";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 sm:px-8">
      <EmptyState title="Esta página no existe o la pieza ya no está publicada" action={{ href: "/catalogo", label: "Ir al catálogo" }} />
    </div>
  );
}
