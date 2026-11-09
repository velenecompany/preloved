-- =====================================================================
-- Consignación con permanencia mínima
-- - La pieza se queda con la empresa al menos 30 días desde que se recibe.
-- - Después de ese plazo el vendedor decide: la retira o la deja publicada sin fecha de vencimiento.
-- - Pago al vendedor: al terminar la ventana de 72 h sin reclamo, se paga ese mismo día (sin días fijos de lote).
-- =====================================================================

-- El contrato ya no vence: queda vigente hasta que el vendedor pida el retiro (después del mínimo).
alter table consignment_agreements alter column duration_days drop not null;
alter table consignment_agreements drop constraint if exists consignment_agreements_duration_days_check;
alter table consignment_agreements add constraint consignment_agreements_duration_days_check
  check (duration_days is null or duration_days > 0);
comment on column consignment_agreements.duration_days is 'Vigencia fija en días. NULL = sin vencimiento (modelo actual).';

alter table consignment_agreements
  add column min_hold_days int not null default 30 check (min_hold_days >= 0);
comment on column consignment_agreements.min_hold_days is 'Días mínimos que la pieza permanece con la empresa desde su recepción, congelados al firmar.';

-- Fecha desde la que el vendedor puede retirar su pieza
create or replace function product_hold_until(p_product_id uuid) returns timestamptz
language sql stable as $$
  select p.received_at + make_interval(days => a.min_hold_days)
  from products p
  join consignment_agreements a on a.product_id = p.id and a.superseded_at is null
  where p.id = p_product_id
$$;

-- ---------------------------------------------------------------------
-- Solicitudes de retiro del vendedor
-- ---------------------------------------------------------------------
create type withdrawal_status as enum ('pendiente', 'lista_para_recoger', 'completada', 'cancelada');

create table withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  requested_by uuid not null references users (id),
  status withdrawal_status not null default 'pendiente',
  notes text,
  requested_at timestamptz not null default now(),
  resolved_by uuid references users (id),
  resolved_at timestamptz
);
create unique index withdrawal_requests_one_open on withdrawal_requests (product_id)
  where status in ('pendiente', 'lista_para_recoger');

-- Solo el dueño de la pieza puede pedir el retiro, solo con la pieza publicada y solo después del mínimo.
create or replace function withdrawal_request_guard() returns trigger
language plpgsql as $$
declare
  p products%rowtype;
  hold_until timestamptz;
begin
  select * into p from products where id = new.product_id;
  if p.seller_id <> new.requested_by then
    raise exception 'Solo el dueño de la pieza puede solicitar su retiro';
  end if;
  if p.status <> 'publicada' then
    raise exception 'Solo se puede solicitar el retiro de una pieza publicada (estado actual: %)', p.status;
  end if;
  hold_until := product_hold_until(new.product_id);
  if hold_until is null then
    raise exception 'La pieza no tiene fecha de recepción o contrato vigente';
  end if;
  if now() < hold_until then
    raise exception 'La pieza debe permanecer en consignación hasta el % (permanencia mínima)', to_char(hold_until at time zone 'America/Mexico_City', 'DD/MM/YYYY');
  end if;
  return new;
end $$;
create trigger withdrawal_requests_guard before insert on withdrawal_requests
  for each row execute function withdrawal_request_guard();

-- Una pieza publicada solo pasa a devolución si hay una solicitud de retiro abierta
-- o si la empresa la retira explícitamente (app.return_reason, p. ej. daño o reclamo de autenticidad).
create or replace function enforce_withdrawal_on_return() returns trigger
language plpgsql as $$
begin
  if old.status = 'publicada' and new.status = 'devolucion_pendiente' then
    if not exists (
      select 1 from withdrawal_requests w
      where w.product_id = new.id and w.status in ('pendiente', 'lista_para_recoger')
    ) and coalesce(current_setting('app.return_reason', true), '') = '' then
      raise exception 'Para devolver una pieza publicada se necesita la solicitud de retiro del vendedor o un motivo de la empresa';
    end if;
  end if;
  return new;
end $$;
create trigger products_return_guard before update of status on products
  for each row execute function enforce_withdrawal_on_return();

-- ---------------------------------------------------------------------
-- Parámetros
-- ---------------------------------------------------------------------
delete from platform_settings where key = 'public.consignment_duration_days';
insert into platform_settings (key, value, description) values
  ('public.consignment_min_hold_days', '30', 'Días mínimos que la pieza permanece con la empresa desde que se recibe')
on conflict (key) do update set value = excluded.value, description = excluded.description, updated_at = now();

update platform_settings
set value = '{"mode": "al_liberarse"}',
    description = 'Cuándo se paga al vendedor: al_liberarse = el mismo día que termina la ventana de aceptación sin reclamo',
    updated_at = now()
where key = 'payout_schedule';
