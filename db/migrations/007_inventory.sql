-- =====================================================================
-- Fase 3B: de la oferta aceptada a la pieza publicada
-- - Cómo llega la pieza: cita en punto fijo, recolección a domicilio o paquetería.
-- - SKU interno al recibirla.
-- - Mensaje al vendedor cuando la autenticación no pasa.
-- - Contrato de consignación v1 (texto que el vendedor acepta).
-- - Opciones de entrega editables desde la base.
-- =====================================================================

-- Nuevo método de llegada. No se usa el valor literal en esta migración (Postgres no lo permite
-- en la misma transacción); por eso las validaciones de abajo comparan como texto.
alter type intake_method add value if not exists 'paqueteria';

-- ---------------------------------------------------------------------
-- Plan de entrega que elige el vendedor (uno vigente por pieza)
-- ---------------------------------------------------------------------
create table intake_plans (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  method intake_method not null,
  scheduled_for timestamptz,          -- cita en punto fijo o recolección
  address jsonb,                      -- recolección: copia de la dirección al agendar
  carrier text,                       -- paquetería
  tracking_number text,
  notes text,
  status text not null default 'agendada' check (status in ('agendada', 'recibida', 'cancelada')),
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intake_plan_details check (
    (method::text = 'sucursal' and scheduled_for is not null)
    or (method::text = 'recoleccion' and scheduled_for is not null and address is not null)
    or (method::text = 'paqueteria')
  )
);
create unique index intake_plans_one_active on intake_plans (product_id) where status = 'agendada';
create index intake_plans_schedule_idx on intake_plans (scheduled_for) where status = 'agendada';
create trigger intake_plans_updated_at before update on intake_plans for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- SKU interno: R + año + consecutivo (R26-00042). Se asigna al recibir la pieza.
-- ---------------------------------------------------------------------
create sequence product_sku_seq start 1;

-- Lo que se le explica al vendedor si la pieza no pasa la autenticación (las notas internas son aparte).
alter table authentication_records add column seller_message text;
alter table authentication_records add constraint auth_failure_explained check (
  result <> 'no_autentica' or seller_message is not null
);

-- ---------------------------------------------------------------------
-- Contrato de consignación, versión 1
-- ---------------------------------------------------------------------
-- Toma la siguiente versión libre por si ya existía un borrador cargado a mano.
insert into legal_documents (kind, version, title, body_md, requires_legal_review, published_at)
select
  'contrato_consignacion',
  coalesce((select max(version) from legal_documents where kind = 'contrato_consignacion'), 0) + 1,
  'Contrato de consignación',
$md$## Objeto
Entregas tu pieza a RELOOP para que la exhibamos y la vendamos a tu nombre, al precio y con la comisión que aparecen en el resumen de este contrato. La pieza sigue siendo tuya hasta que se vende.

## Precio y comisión
El precio de publicación y la comisión quedan fijos en este contrato. Si nuestras tarifas cambian después, no afectan a tu pieza. No aplicamos descuentos sin tu autorización.

## Permanencia mínima
La pieza se queda con nosotros al menos 30 días a partir de la fecha en que la recibimos. Durante ese plazo no se puede retirar.
Al cumplir el plazo, tú decides: la retiras o la dejas publicada. Si la dejas, sigue a la venta sin fecha de vencimiento, y puedes pedir el retiro cuando quieras mientras no esté reservada o vendida.

## Custodia
Mientras la pieza está con nosotros, respondemos por su resguardo.

## Autenticación
Publicamos solo piezas revisadas físicamente por nuestro equipo. Si después de publicarla se demuestra que no es auténtica, se reembolsa al comprador, la pieza no se te paga y el caso se revisa contigo.

## Pago
Cuando se vende y se entrega, el comprador tiene 72 horas para reportar un problema. Al terminar ese plazo sin reportes, te transferimos por SPEI a la cuenta registrada, ese mismo día, el precio de venta menos la comisión.

## Aceptación
Aceptas este contrato desde tu cuenta. Guardamos la fecha, la hora y los datos de la conexión desde la que lo aceptaste.$md$,
  true, now();

-- ---------------------------------------------------------------------
-- Opciones de entrega (se editan aquí o desde un panel futuro)
-- ---------------------------------------------------------------------
insert into platform_settings (key, value, description) values (
  'public.intake_options',
  '{
    "sucursal": {
      "enabled": true,
      "address": "Dirección por confirmar, Guadalajara, Jal.",
      "days": [1, 2, 3, 4, 5, 6],
      "from_hour": 11,
      "to_hour": 19,
      "slot_minutes": 60
    },
    "recoleccion": {
      "enabled": true,
      "fee_cents": 0,
      "postal_prefixes": ["44", "45"],
      "municipalities": ["Guadalajara", "Zapopan", "San Pedro Tlaquepaque", "Tonalá", "Tlajomulco de Zúñiga", "El Salto"],
      "days": [1, 2, 3, 4, 5],
      "windows": [[10, 14], [15, 19]]
    },
    "paqueteria": {
      "enabled": true,
      "address": "Dirección por confirmar, Guadalajara, Jal.",
      "notes": "El envío corre por tu cuenta. Asegura el paquete por el valor de la pieza y empácala con su caja y accesorios."
    },
    "min_lead_hours": 18,
    "horizon_days": 14
  }',
  'Cómo puede entregar el vendedor una pieza preaprobada: punto fijo, recolección y paquetería'
)
on conflict (key) do update set value = excluded.value, description = excluded.description, updated_at = now();
