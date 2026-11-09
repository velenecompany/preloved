-- =====================================================================
-- Fase 3A: solicitudes de consignación
-- - Contrapropuesta: el vendedor puede responder a una preaprobación con otro precio.
-- - Aceptación de la oferta registrada en la ronda de la solicitud.
-- - Etiqueta de cada foto preliminar (qué toma de la guía es).
-- - Catálogo inicial de marcas aceptadas.
-- =====================================================================

-- Contrapropuesta: de preaprobada vuelve a revisión con una ronda nueva.
insert into product_status_transitions (from_status, to_status) values ('preaprobada', 'solicitud_enviada');

alter table consignment_requests
  add column seller_accepted_at timestamptz,
  add column seller_note text;

alter table product_images add column slot text;
create index product_images_slot_idx on product_images (product_id, slot);

-- Al rechazar o pedir información se guarda el mensaje para el vendedor; al preaprobar, la oferta.
alter table consignment_requests add constraint decision_has_detail check (
  decision = 'pendiente'
  or (decision = 'preaprobada' and offered_price_cents is not null)
  or (decision = 'requiere_informacion' and admin_notes is not null)
  or (decision = 'rechazada' and rejection_reason is not null)
);

create index consignment_requests_pending_idx on consignment_requests (decision, created_at) where decision = 'pendiente';

-- Marcas aceptadas al iniciar (editables después). No son productos: solo nombres para el formulario.
insert into brands (slug, name, is_accepted) values
  ('alexander-mcqueen', 'Alexander McQueen', true),
  ('amiri', 'Amiri', true),
  ('adidas', 'Adidas', true),
  ('balenciaga', 'Balenciaga', true),
  ('bottega-veneta', 'Bottega Veneta', true),
  ('burberry', 'Burberry', true),
  ('celine', 'Celine', true),
  ('chanel', 'Chanel', true),
  ('chrome-hearts', 'Chrome Hearts', true),
  ('dior', 'Dior', true),
  ('dolce-gabbana', 'Dolce & Gabbana', true),
  ('fear-of-god', 'Fear of God', true),
  ('fendi', 'Fendi', true),
  ('givenchy', 'Givenchy', true),
  ('golden-goose', 'Golden Goose', true),
  ('goyard', 'Goyard', true),
  ('gucci', 'Gucci', true),
  ('hermes', 'Hermès', true),
  ('jordan', 'Jordan', true),
  ('loewe', 'Loewe', true),
  ('louis-vuitton', 'Louis Vuitton', true),
  ('miu-miu', 'Miu Miu', true),
  ('moncler', 'Moncler', true),
  ('new-balance', 'New Balance', true),
  ('nike', 'Nike', true),
  ('off-white', 'Off-White', true),
  ('prada', 'Prada', true),
  ('rick-owens', 'Rick Owens', true),
  ('saint-laurent', 'Saint Laurent', true),
  ('stone-island', 'Stone Island', true),
  ('supreme', 'Supreme', true),
  ('valentino', 'Valentino', true),
  ('versace', 'Versace', true)
on conflict (slug) do nothing;
