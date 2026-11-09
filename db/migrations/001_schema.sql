-- =====================================================================
-- Marketplace preloved de diseñador — esquema base (Neon / PostgreSQL)
-- Todos los montos en centavos MXN (bigint). Estados controlados por enums.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists unaccent;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type app_role as enum ('comprador', 'vendedor', 'admin', 'autenticador', 'operaciones', 'finanzas');

create type product_status as enum (
  'solicitud_borrador', 'solicitud_enviada', 'requiere_informacion', 'preaprobada', 'rechazada',
  'pendiente_de_entrega', 'recibida', 'en_autenticacion', 'autenticacion_fallida',
  'pendiente_de_contrato', 'pendiente_de_fotografia', 'publicada', 'reservada', 'vendida',
  'entregada', 'en_ventana_de_aceptacion', 'cerrada', 'retirada_por_vendedor',
  'devolucion_pendiente', 'devuelta_al_vendedor'
);

create type declared_condition as enum (
  'nuevo_con_etiquetas', 'nuevo_sin_etiquetas', 'excelente', 'muy_bueno', 'bueno', 'aceptable'
);
create type size_system as enum ('MX', 'US', 'UK', 'EU', 'UNICA');
create type fit_type as enum ('normal', 'amplio', 'reducido');
create type image_kind as enum ('preliminar', 'prueba_posesion', 'comprobante', 'recepcion', 'final', 'defecto', 'empaque');
create type included_item as enum (
  'full_set', 'solo_par', 'solo_prenda', 'solo_caja', 'caja_y_accesorios',
  'ticket_departamental', 'ticket_boutique', 'certificado_autenticidad', 'otros_accesorios'
);
create type review_decision as enum ('pendiente', 'preaprobada', 'requiere_informacion', 'rechazada');
create type auth_result as enum ('autentica', 'no_autentica', 'no_concluyente');
create type assessment_source as enum ('ia', 'humana');
create type intake_method as enum ('sucursal', 'recoleccion');

create type order_status as enum (
  'pendiente_pago', 'pagado', 'en_preparacion', 'en_camino', 'entregado',
  'en_ventana_aceptacion', 'en_disputa', 'cerrado', 'cancelado', 'reembolsado'
);
create type money_status as enum (
  'pendiente', 'cobrado', 'retenido', 'en_disputa', 'disponible', 'en_lote_de_pago', 'liquidado', 'reembolsado'
);
create type delivery_method as enum ('entrega_local', 'recoger_en_sucursal', 'envio_nacional');
create type payment_status as enum ('pendiente', 'en_proceso', 'aprobado', 'rechazado', 'cancelado', 'reembolsado', 'reembolsado_parcial');
create type refund_status as enum ('solicitado', 'procesado', 'fallido');
create type dispute_status as enum ('abierta', 'en_revision', 'resuelta_reembolso_total', 'resuelta_reembolso_parcial', 'rechazada');
create type payout_batch_status as enum ('borrador', 'exportado', 'pagado', 'cancelado');
create type payout_status as enum ('pendiente', 'pagado', 'fallido', 'cancelado');
create type ledger_account_type as enum ('activo', 'pasivo', 'ingreso', 'gasto');
create type shipment_direction as enum ('entrada', 'salida');
create type shipment_status as enum (
  'recoleccion_pendiente', 'en_ruta_recoleccion', 'recibida_en_centro',
  'preparando', 'en_camino', 'entregado', 'incidencia'
);
create type appointment_status as enum ('agendada', 'completada', 'cancelada', 'no_asistio');
create type legal_kind as enum (
  'terminos', 'privacidad', 'contrato_consignacion', 'autenticidad', 'envios', 'devoluciones', 'vendedores'
);

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------
-- Sesión de la app: el servidor ejecuta `select set_config('app.user_id', <uuid>, true)` dentro de cada
-- transacción que cambia estados, para que los triggers registren quién hizo el cambio.
create or replace function app_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  full_name text,
  phone text,
  email_verified_at timestamptz,
  is_suspended boolean not null default false,
  suspended_reason text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_format check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create unique index users_email_unique on users (lower(email));
create trigger users_updated_at before update on users for each row execute function set_updated_at();

-- Tokens de un solo uso (se guarda el hash SHA-256, nunca el token)
create table email_verification_tokens (
  token_hash text primary key,
  user_id uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create table password_reset_tokens (
  token_hash text primary key,
  user_id uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table user_roles (
  user_id uuid not null references users (id) on delete cascade,
  role app_role not null,
  granted_by uuid references users (id),
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table seller_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null unique references users (id) on delete cascade,
  holder_name text not null,
  bank_name text not null,
  clabe char(18) not null check (clabe ~ '^[0-9]{18}$'),
  rfc text check (rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger seller_payout_accounts_updated_at before update on seller_payout_accounts for each row execute function set_updated_at();

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  label text,
  recipient_name text not null,
  phone text not null,
  street text not null,
  exterior_number text not null,
  interior_number text,
  neighborhood text not null,
  city text not null,
  state text not null,
  postal_code char(5) not null check (postal_code ~ '^[0-9]{5}$'),
  delivery_references text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index addresses_user_idx on addresses (user_id);
create trigger addresses_updated_at before update on addresses for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
create table product_categories (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  commission_group text not null,
  is_enabled boolean not null default true,
  sort_order smallint not null default 0
);

create table brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  is_accepted boolean not null default true,
  created_at timestamptz not null default now()
);

create table inventory_locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true
);

create table products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  slug text unique,
  seller_id uuid not null references users (id),
  category_id smallint not null references product_categories (id),
  brand_id uuid not null references brands (id),
  model text not null,
  description text,
  size_label text,
  size_system size_system,
  fit fit_type,
  declared_condition declared_condition not null,
  final_condition_score numeric(3, 1) check (final_condition_score between 1 and 10),
  includes included_item[] not null default '{}',
  asking_price_cents bigint not null check (asking_price_cents > 0),
  listed_price_cents bigint check (listed_price_cents > 0),
  status product_status not null default 'solicitud_borrador',
  is_featured boolean not null default false,
  location_id uuid references inventory_locations (id),
  received_at timestamptz,
  published_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector,
  constraint published_needs_listing check (
    status not in ('publicada', 'reservada', 'vendida') or (listed_price_cents is not null and slug is not null and sku is not null)
  )
);
create index products_status_idx on products (status);
create index products_seller_idx on products (seller_id);
create index products_category_idx on products (category_id);
create index products_brand_idx on products (brand_id);
create index products_published_idx on products (published_at desc) where status = 'publicada';
create index products_search_idx on products using gin (search);
create trigger products_updated_at before update on products for each row execute function set_updated_at();

create or replace function products_search_refresh() returns trigger
language plpgsql as $$
declare
  brand_name text;
begin
  select name into brand_name from brands where id = new.brand_id;
  new.search :=
    setweight(to_tsvector('simple', unaccent(coalesce(brand_name, ''))), 'A') ||
    setweight(to_tsvector('simple', unaccent(coalesce(new.model, ''))), 'A') ||
    setweight(to_tsvector('spanish', unaccent(coalesce(new.description, ''))), 'C');
  return new;
end $$;
create trigger products_search before insert or update of model, description, brand_id on products
  for each row execute function products_search_refresh();

create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  kind image_kind not null,
  url text not null,               -- URL de Vercel Blob
  pathname text not null,          -- ruta dentro del store, para borrar o reemplazar
  caption text,
  sort_order smallint not null default 0,
  width int,
  height int,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);
create index product_images_product_idx on product_images (product_id, kind, sort_order);

create table product_status_history (
  id bigint generated always as identity primary key,
  product_id uuid not null references products (id) on delete cascade,
  from_status product_status,
  to_status product_status not null,
  changed_by uuid references users (id),
  reason text,
  created_at timestamptz not null default now()
);
create index product_status_history_product_idx on product_status_history (product_id, created_at);

create table favorites (
  user_id uuid not null references users (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- ---------------------------------------------------------------------
-- Transiciones de pieza (réplica de src/lib/domain/state-machines.ts)
-- ---------------------------------------------------------------------
create table product_status_transitions (
  from_status product_status not null,
  to_status product_status not null,
  primary key (from_status, to_status)
);

-- BEGIN product_status_transitions
insert into product_status_transitions (from_status, to_status) values
  ('solicitud_borrador', 'solicitud_enviada'),
  ('solicitud_borrador', 'retirada_por_vendedor'),
  ('solicitud_enviada', 'requiere_informacion'),
  ('solicitud_enviada', 'preaprobada'),
  ('solicitud_enviada', 'rechazada'),
  ('requiere_informacion', 'solicitud_enviada'),
  ('requiere_informacion', 'retirada_por_vendedor'),
  ('preaprobada', 'pendiente_de_entrega'),
  ('preaprobada', 'retirada_por_vendedor'),
  ('pendiente_de_entrega', 'recibida'),
  ('pendiente_de_entrega', 'retirada_por_vendedor'),
  ('recibida', 'en_autenticacion'),
  ('en_autenticacion', 'pendiente_de_contrato'),
  ('en_autenticacion', 'autenticacion_fallida'),
  ('autenticacion_fallida', 'devolucion_pendiente'),
  ('pendiente_de_contrato', 'pendiente_de_fotografia'),
  ('pendiente_de_contrato', 'devolucion_pendiente'),
  ('pendiente_de_fotografia', 'publicada'),
  ('publicada', 'reservada'),
  ('publicada', 'devolucion_pendiente'),
  ('reservada', 'publicada'),
  ('reservada', 'vendida'),
  ('vendida', 'entregada'),
  ('vendida', 'publicada'),
  ('entregada', 'en_ventana_de_aceptacion'),
  ('en_ventana_de_aceptacion', 'cerrada'),
  ('en_ventana_de_aceptacion', 'recibida'),
  ('devolucion_pendiente', 'devuelta_al_vendedor');
-- END product_status_transitions

-- ---------------------------------------------------------------------
-- Consignación
-- ---------------------------------------------------------------------
create table consignment_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  round smallint not null default 1,
  seller_price_cents bigint not null check (seller_price_cents > 0),
  offered_price_cents bigint check (offered_price_cents > 0),
  decision review_decision not null default 'pendiente',
  admin_notes text,
  rejection_reason text,
  decided_by uuid references users (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (product_id, round)
);

create table possession_proofs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references products (id) on delete cascade,
  code text not null,
  image_id uuid references product_images (id),
  verified_by uuid references users (id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table legal_documents (
  id uuid primary key default gen_random_uuid(),
  kind legal_kind not null,
  version int not null,
  title text not null,
  body_md text not null,
  requires_legal_review boolean not null default true,
  published_at timestamptz,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  unique (kind, version)
);

create table commission_rules (
  id uuid primary key default gen_random_uuid(),
  commission_group text not null,
  min_price_cents bigint not null check (min_price_cents >= 0),
  max_price_cents bigint check (max_price_cents is null or max_price_cents > min_price_cents),
  rate_bps int not null check (rate_bps between 0 and 10000),
  min_fee_cents bigint not null default 0 check (min_fee_cents >= 0),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);
create index commission_rules_active_idx on commission_rules (commission_group, min_price_cents) where valid_to is null;

create table consignment_agreements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  legal_document_id uuid not null references legal_documents (id),
  agreed_price_cents bigint not null check (agreed_price_cents > 0),
  commission_rule_id uuid not null references commission_rules (id),
  commission_rate_bps int not null check (commission_rate_bps between 0 and 10000),
  commission_min_fee_cents bigint not null default 0,
  duration_days int not null check (duration_days > 0),
  max_discount_bps int not null default 0 check (max_discount_bps between 0 and 10000),
  accepted_at timestamptz,
  accepted_ip inet,
  accepted_user_agent text,
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index consignment_agreements_active_idx on consignment_agreements (product_id) where superseded_at is null;

create table intake_records (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  method intake_method not null,
  received_by uuid not null references users (id),
  received_at timestamptz not null default now(),
  accessories_received included_item[] not null default '{}',
  notes text
);

create table authentication_records (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  authenticator_id uuid not null references users (id),
  checklist jsonb not null default '{}'::jsonb,
  result auth_result not null,
  notes text,
  external_provider text,
  external_certificate text,
  external_document_path text,
  created_at timestamptz not null default now()
);
create index authentication_records_product_idx on authentication_records (product_id, created_at desc);

create table condition_assessments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  source assessment_source not null,
  score numeric(3, 1) check (score between 1 and 10),
  needs_more_photos boolean not null default false,
  confidence numeric(3, 2) check (confidence between 0 and 1),
  summary text,
  defects jsonb not null default '[]'::jsonb,
  missing_areas text[] not null default '{}',
  recommendations text[] not null default '{}',
  model text,
  raw_response jsonb,
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  constraint ia_needs_score_or_more_photos check (score is not null or needs_more_photos)
);
create index condition_assessments_product_idx on condition_assessments (product_id, created_at desc);

-- Regla de oro a nivel base de datos: transiciones válidas y publicación bloqueada sin autenticación.
create or replace function enforce_product_status() returns trigger
language plpgsql as $$
declare
  last_auth auth_result;
  accepted boolean;
  final_images int;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'solicitud_borrador' then
      raise exception 'Una pieza nueva debe iniciar como solicitud_borrador';
    end if;
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  if not exists (
    select 1 from product_status_transitions t where t.from_status = old.status and t.to_status = new.status
  ) then
    raise exception 'Transición inválida de pieza: % → %', old.status, new.status;
  end if;

  if new.status = 'publicada' then
    select result into last_auth from authentication_records
      where product_id = new.id order by created_at desc limit 1;
    select exists (
      select 1 from consignment_agreements
      where product_id = new.id and superseded_at is null and accepted_at is not null
    ) into accepted;
    select count(*) into final_images from product_images where product_id = new.id and kind = 'final';

    if last_auth is distinct from 'autentica' then
      raise exception 'No se puede publicar: la pieza no tiene autenticación física aprobada';
    end if;
    if not accepted then
      raise exception 'No se puede publicar: falta el contrato de consignación aceptado';
    end if;
    if final_images < 1 then
      raise exception 'No se puede publicar: faltan fotografías finales';
    end if;
    if new.final_condition_score is null then
      raise exception 'No se puede publicar: falta la calificación de condición confirmada';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;

  if new.status = 'vendida' then
    new.sold_at := coalesce(new.sold_at, now());
  end if;

  insert into product_status_history (product_id, from_status, to_status, changed_by, reason)
  values (new.id, old.status, new.status, app_user_id(), current_setting('app.status_reason', true));

  return new;
end $$;

create trigger products_status_guard before insert or update of status on products
  for each row execute function enforce_product_status();

-- ---------------------------------------------------------------------
-- Pedidos y pagos
-- ---------------------------------------------------------------------
create table orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  buyer_id uuid not null references users (id),
  status order_status not null default 'pendiente_pago',
  money_status money_status not null default 'pendiente',
  delivery_method delivery_method not null,
  shipping_address jsonb,
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  shipping_cents bigint not null default 0 check (shipping_cents >= 0),
  total_cents bigint not null,
  reserved_until timestamptz,
  paid_at timestamptz,
  delivered_at timestamptz,
  acceptance_ends_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_total_adds_up check (total_cents = subtotal_cents + shipping_cents)
);
create index orders_buyer_idx on orders (buyer_id, created_at desc);
create index orders_status_idx on orders (status);
create trigger orders_updated_at before update on orders for each row execute function set_updated_at();

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  product_id uuid not null references products (id),
  price_cents bigint not null check (price_cents > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
-- Prevención de ventas duplicadas: una pieza solo puede estar en un pedido activo.
create unique index order_items_one_active_per_product on order_items (product_id) where is_active;

create table order_commissions (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references order_items (id),
  seller_id uuid not null references users (id),
  agreement_id uuid not null references consignment_agreements (id),
  commission_rule_id uuid not null references commission_rules (id),
  sale_price_cents bigint not null check (sale_price_cents > 0),
  rate_bps int not null,
  min_fee_cents bigint not null,
  commission_cents bigint not null check (commission_cents >= 0),
  seller_gross_cents bigint not null check (seller_gross_cents >= 0),
  money_status money_status not null default 'retenido',
  available_at timestamptz,
  created_at timestamptz not null default now(),
  constraint commission_adds_up check (commission_cents + seller_gross_cents = sale_price_cents)
);
create index order_commissions_seller_idx on order_commissions (seller_id, money_status);

create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id),
  provider text not null,
  provider_payment_id text,
  provider_preference_id text,
  status payment_status not null default 'pendiente',
  amount_cents bigint not null check (amount_cents > 0),
  processor_fee_cents bigint not null default 0,
  net_received_cents bigint,
  raw jsonb,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);
create index payments_order_idx on payments (order_id);
create trigger payments_updated_at before update on payments for each row execute function set_updated_at();

create table payment_webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text,
  payload jsonb not null,
  signature_valid boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (provider, event_id)
);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id),
  payment_id uuid not null references payments (id),
  amount_cents bigint not null check (amount_cents > 0),
  reason text not null,
  provider_refund_id text,
  status refund_status not null default 'solicitado',
  created_by uuid references users (id),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id),
  opened_by uuid not null references users (id),
  reason text not null,
  description text,
  status dispute_status not null default 'abierta',
  resolution_notes text,
  resolved_by uuid references users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index disputes_one_open_per_order on disputes (order_id) where status in ('abierta', 'en_revision');

-- ---------------------------------------------------------------------
-- Ledger de doble entrada (inmutable)
-- ---------------------------------------------------------------------
create table ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  type ledger_account_type not null,
  seller_id uuid references users (id),
  created_at timestamptz not null default now(),
  constraint seller_account_shape check ((seller_id is null) = (code not like 'por_pagar_vendedor:%'))
);

create table ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('venta', 'comision_procesador', 'liquidacion', 'reembolso', 'ajuste')),
  order_id uuid references orders (id),
  payout_id uuid,
  refund_id uuid references refunds (id),
  reverses_id uuid references ledger_transactions (id),
  description text not null,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);

create table ledger_entries (
  id bigint generated always as identity primary key,
  transaction_id uuid not null references ledger_transactions (id),
  account_id uuid not null references ledger_accounts (id),
  debit_cents bigint not null default 0 check (debit_cents >= 0),
  credit_cents bigint not null default 0 check (credit_cents >= 0),
  created_at timestamptz not null default now(),
  constraint one_side_only check ((debit_cents > 0) <> (credit_cents > 0))
);
create index ledger_entries_account_idx on ledger_entries (account_id);
create index ledger_entries_tx_idx on ledger_entries (transaction_id);

create or replace function ledger_block_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'El ledger es inmutable: registra un asiento de reversa en lugar de % ', tg_op;
end $$;
create trigger ledger_entries_immutable before update or delete on ledger_entries
  for each row execute function ledger_block_mutation();
create trigger ledger_transactions_immutable before update or delete on ledger_transactions
  for each row execute function ledger_block_mutation();

-- Verificación al final de la transacción: cada asiento debe cuadrar.
create or replace function ledger_check_balanced() returns trigger
language plpgsql as $$
declare
  d bigint;
  c bigint;
begin
  select coalesce(sum(debit_cents), 0), coalesce(sum(credit_cents), 0)
    into d, c from ledger_entries where transaction_id = new.transaction_id;
  if d <> c then
    raise exception 'Asiento % descuadrado: débitos % ≠ créditos %', new.transaction_id, d, c;
  end if;
  return null;
end $$;
create constraint trigger ledger_entries_balanced after insert on ledger_entries
  deferrable initially deferred for each row execute function ledger_check_balanced();

create view ledger_account_balances as
select a.id as account_id, a.code, a.type, a.seller_id,
       coalesce(sum(e.debit_cents), 0) as debit_cents,
       coalesce(sum(e.credit_cents), 0) as credit_cents,
       case when a.type in ('activo', 'gasto')
            then coalesce(sum(e.debit_cents), 0) - coalesce(sum(e.credit_cents), 0)
            else coalesce(sum(e.credit_cents), 0) - coalesce(sum(e.debit_cents), 0) end as balance_cents
from ledger_accounts a
left join ledger_entries e on e.account_id = a.id
group by a.id;

-- Saldos del vendedor por estado del dinero (a partir de comisiones congeladas)
create view seller_balances as
select seller_id,
  coalesce(sum(seller_gross_cents) filter (where money_status in ('retenido', 'en_disputa')), 0) as retenido_cents,
  coalesce(sum(seller_gross_cents) filter (where money_status in ('disponible', 'en_lote_de_pago')), 0) as disponible_cents,
  coalesce(sum(seller_gross_cents) filter (where money_status = 'liquidado'), 0) as liquidado_cents
from order_commissions
group by seller_id;

-- ---------------------------------------------------------------------
-- Liquidaciones
-- ---------------------------------------------------------------------
create table payout_batches (
  id uuid primary key default gen_random_uuid(),
  status payout_batch_status not null default 'borrador',
  created_by uuid not null references users (id),
  exported_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references payout_batches (id),
  seller_id uuid not null references users (id),
  payout_account_snapshot jsonb not null,
  gross_cents bigint not null check (gross_cents > 0),
  withholding_cents bigint not null default 0 check (withholding_cents >= 0),
  net_cents bigint not null check (net_cents = gross_cents - withholding_cents),
  status payout_status not null default 'pendiente',
  spei_tracking_key text,
  receipt_path text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (batch_id, seller_id)
);
alter table ledger_transactions add constraint ledger_transactions_payout_fk foreign key (payout_id) references payouts (id);

create table payout_items (
  payout_id uuid not null references payouts (id) on delete cascade,
  order_commission_id uuid not null unique references order_commissions (id),
  primary key (payout_id, order_commission_id)
);

create table tax_withholdings (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null references payouts (id),
  order_commission_id uuid not null references order_commissions (id),
  tax text not null check (tax in ('ISR', 'IVA')),
  rate_bps int not null check (rate_bps between 0 and 10000),
  base_cents bigint not null,
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

create table reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'en_proceso' check (status in ('en_proceso', 'sin_diferencias', 'con_diferencias', 'fallido')),
  mismatches jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ---------------------------------------------------------------------
-- Logística
-- ---------------------------------------------------------------------
create table coverage_zones (
  postal_code char(5) primary key check (postal_code ~ '^[0-9]{5}$'),
  municipality text not null,
  delivery_fee_cents bigint not null default 0 check (delivery_fee_cents >= 0),
  allows_pickup boolean not null default true,
  is_active boolean not null default true
);

create table pickup_appointments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  seller_id uuid not null references users (id),
  method intake_method not null,
  scheduled_for timestamptz not null,
  address_id uuid references addresses (id),
  status appointment_status not null default 'agendada',
  notes text,
  created_at timestamptz not null default now(),
  constraint pickup_needs_address check (method = 'sucursal' or address_id is not null)
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  direction shipment_direction not null,
  order_id uuid references orders (id),
  product_id uuid references products (id),
  carrier text,
  tracking_number text,
  cost_cents bigint not null default 0 check (cost_cents >= 0),
  insured_value_cents bigint,
  status shipment_status not null,
  assigned_to uuid references users (id),
  proof_image_path text,
  received_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shipment_target check (
    (direction = 'salida' and order_id is not null) or (direction = 'entrada' and product_id is not null)
  )
);
create trigger shipments_updated_at before update on shipments for each row execute function set_updated_at();

create table shipment_events (
  id bigint generated always as identity primary key,
  shipment_id uuid not null references shipments (id) on delete cascade,
  status shipment_status not null,
  notes text,
  created_by uuid references users (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Sistema
-- ---------------------------------------------------------------------
create table platform_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references users (id),
  updated_at timestamptz not null default now()
);

create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references users (id),
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb,
  ip inet,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity, entity_id);
create trigger audit_logs_immutable before update or delete on audit_logs
  for each row execute function ledger_block_mutation();

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Todo usuario nuevo es comprador
-- ---------------------------------------------------------------------
create or replace function users_default_role() returns trigger
language plpgsql as $$
begin
  insert into user_roles (user_id, role) values (new.id, 'comprador');
  return new;
end $$;
create trigger users_default_role after insert on users for each row execute function users_default_role();
