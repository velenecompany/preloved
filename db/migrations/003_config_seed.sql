-- =====================================================================
-- Configuración inicial (no son datos de prueba: son catálogos y parámetros operativos)
-- =====================================================================

insert into product_categories (slug, name, commission_group, is_enabled, sort_order) values
  ('sneakers', 'Sneakers', 'sneakers_streetwear', true, 1),
  ('luxury-clothing', 'Luxury Clothing', 'lujo', true, 2),
  ('streetwear', 'Streetwear', 'sneakers_streetwear', true, 3),
  ('designer-bags', 'Designer Bags', 'lujo', true, 4),
  ('accessories', 'Accessories', 'lujo', true, 5),
  ('watches', 'Watches', 'lujo', false, 6);

-- Reglas de comisión iniciales (editables desde el panel). Rangos [mín, máx) en centavos.
insert into commission_rules (commission_group, min_price_cents, max_price_cents, rate_bps, min_fee_cents) values
  ('lujo', 0, 1100000, 3000, 0),
  ('lujo', 1100000, 6000000, 2000, 0),
  ('lujo', 6000000, null, 1500, 0),
  ('sneakers_streetwear', 0, 1100000, 1800, 0),
  ('sneakers_streetwear', 1100000, 6000000, 1500, 0),
  ('sneakers_streetwear', 6000000, null, 1200, 0);

insert into ledger_accounts (code, name, type) values
  ('efectivo_procesador', 'Saldo en procesador de pagos', 'activo'),
  ('efectivo_banco', 'Cuenta bancaria de la empresa', 'activo'),
  ('ingreso_comision', 'Ingreso por comisiones', 'ingreso'),
  ('ingreso_envio', 'Ingreso por envíos cobrados', 'ingreso'),
  ('gasto_procesador', 'Comisiones del procesador de pagos', 'gasto'),
  ('retenciones_por_enterar', 'Retenciones fiscales por enterar', 'pasivo'),
  ('reembolsos', 'Reembolsos', 'gasto');

-- Parámetros. Las claves `public.*` son legibles por cualquier visitante.
insert into platform_settings (key, value, description) values
  ('public.acceptance_window_hours', '72', 'Horas que tiene el comprador para reportar un problema tras la entrega'),
  ('public.consignment_duration_days', '90', 'Duración por defecto del contrato de consignación'),
  ('public.reservation_minutes', '30', 'Minutos que una pieza queda reservada mientras se paga'),
  ('public.local_delivery_enabled', 'true', 'Entrega local en Guadalajara y zona metropolitana'),
  ('public.national_shipping_enabled', 'false', 'Envío nacional (fase posterior)'),
  ('processor_fee_absorbed_by', '"empresa"', 'Quién absorbe la comisión del procesador: empresa o vendedor'),
  ('payout_schedule', '{"days": ["martes", "viernes"]}', 'Días de generación de lotes de liquidación'),
  ('tax_withholding', '{"enabled": false, "confirmed_with_accountant": false, "isr_bps": null, "iva_bps": null, "no_rfc_bps": null}',
   'Retenciones fiscales: desactivadas hasta confirmar tasas y aplicabilidad con un contador');

-- Cobertura inicial de ejemplo vacía: se carga desde el panel con los códigos postales reales que se atenderán.
