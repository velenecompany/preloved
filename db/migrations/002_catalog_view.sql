-- =====================================================================
-- Vista pública del catálogo
-- En Neon no hay RLS por usuario: la autorización vive en el servidor (lib/auth).
-- Las páginas públicas SOLO consultan esta vista, que ya filtra estados públicos.
-- =====================================================================

create or replace function is_public_status(s product_status) returns boolean
language sql immutable as $$
  select s in ('publicada', 'reservada', 'vendida', 'entregada', 'en_ventana_de_aceptacion', 'cerrada');
$$;

create view catalog_products as
select
  p.id, p.slug, p.sku, p.model, p.description, p.size_label, p.size_system, p.fit,
  p.declared_condition, p.final_condition_score, p.includes, p.listed_price_cents,
  p.status, p.is_featured, p.received_at, p.published_at, p.sold_at, p.search,
  c.slug as category_slug, c.name as category_name,
  b.slug as brand_slug, b.name as brand_name,
  (select ar.result from authentication_records ar where ar.product_id = p.id order by ar.created_at desc limit 1) as authentication_result,
  (select ar.created_at from authentication_records ar where ar.product_id = p.id order by ar.created_at desc limit 1) as authenticated_at,
  (select ar.external_provider from authentication_records ar where ar.product_id = p.id and ar.external_certificate is not null order by ar.created_at desc limit 1) as external_provider,
  (select pi.url from product_images pi where pi.product_id = p.id and pi.kind = 'final' order by pi.sort_order limit 1) as cover_url
from products p
join product_categories c on c.id = p.category_id
join brands b on b.id = p.brand_id
where is_public_status(p.status);

