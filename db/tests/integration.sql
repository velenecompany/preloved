-- Pruebas de integración de las reglas en base de datos. Se ejecutan con scripts/test-db.sh.
\set ON_ERROR_STOP on
set client_min_messages = warning;

create or replace function expect_error(sql text, fragment text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if position(fragment in sqlerrm) = 0 then
      raise exception 'Se esperaba un error con "%" pero fue: %', fragment, sqlerrm;
    end if;
    return;
  end;
  raise exception 'Se esperaba un error con "%" y la instrucción tuvo éxito: %', fragment, sql;
end $$;

-- Datos de prueba (solo existen dentro de esta base temporal)
insert into users (id, email, password_hash) values
  ('00000000-0000-0000-0000-00000000000a', 'vendedor@prueba.mx', 'x'),
  ('00000000-0000-0000-0000-00000000000b', 'comprador@prueba.mx', 'x'),
  ('00000000-0000-0000-0000-00000000000c', 'autenticador@prueba.mx', 'x');

-- Todo usuario nuevo recibe el rol comprador
do $$ begin
  if (select count(*) from user_roles where role = 'comprador') <> 3 then raise exception 'Faltan roles de comprador'; end if;
end $$;
select expect_error($q$ insert into users (email, password_hash) values ('VENDEDOR@prueba.mx', 'x') $q$, 'users_email_unique');
insert into user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000000c', 'autenticador');
insert into brands (slug, name) values ('marca-prueba', 'Marca Prueba');

insert into products (id, seller_id, category_id, brand_id, model, declared_condition, asking_price_cents)
select '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a',
       (select id from product_categories where slug = 'designer-bags'), (select id from brands limit 1),
       'Modelo prueba', 'excelente', 800000;

-- 1. Una pieza nueva no puede nacer publicada
select expect_error($q$
  insert into products (seller_id, category_id, brand_id, model, declared_condition, asking_price_cents, status)
  values ('00000000-0000-0000-0000-00000000000a', 1, (select id from brands limit 1), 'x', 'bueno', 100, 'publicada')
$q$, 'solicitud_borrador');

-- 2. Transición inválida
select expect_error($q$
  update products set status = 'publicada' where id = '10000000-0000-0000-0000-000000000001'
$q$, 'Transición inválida');

-- 3. Recorrer el flujo hasta antes de publicar
update products set status = 'solicitud_enviada' where id = '10000000-0000-0000-0000-000000000001';
update products set status = 'preaprobada' where id = '10000000-0000-0000-0000-000000000001';
update products set status = 'pendiente_de_entrega' where id = '10000000-0000-0000-0000-000000000001';
update products set status = 'recibida' where id = '10000000-0000-0000-0000-000000000001';
update products set status = 'en_autenticacion' where id = '10000000-0000-0000-0000-000000000001';
update products set status = 'pendiente_de_contrato' where id = '10000000-0000-0000-0000-000000000001';
update products set status = 'pendiente_de_fotografia',
  sku = 'P-0001', slug = 'marca-prueba-modelo-prueba-p0001', listed_price_cents = 800000
  where id = '10000000-0000-0000-0000-000000000001';

-- 4. Regla de oro: sin autenticación no se publica
select expect_error($q$
  update products set status = 'publicada' where id = '10000000-0000-0000-0000-000000000001'
$q$, 'autenticación física');

insert into authentication_records (product_id, authenticator_id, result)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'autentica');
select expect_error($q$
  update products set status = 'publicada' where id = '10000000-0000-0000-0000-000000000001'
$q$, 'contrato');

-- El contrato v1 lo carga la migración 007.
insert into consignment_agreements (product_id, legal_document_id, agreed_price_cents, commission_rule_id, commission_rate_bps, duration_days, accepted_at)
select '10000000-0000-0000-0000-000000000001', (select id from legal_documents limit 1), 800000,
       (select id from commission_rules where commission_group = 'lujo' and min_price_cents = 0), 3000, 90, now();
select expect_error($q$
  update products set status = 'publicada' where id = '10000000-0000-0000-0000-000000000001'
$q$, 'fotografías');

insert into product_images (product_id, kind, url, pathname)
values ('10000000-0000-0000-0000-000000000001', 'final', 'https://blob.example/p-0001/1.jpg', 'catalogo/p-0001/1.jpg');
select expect_error($q$
  update products set status = 'publicada' where id = '10000000-0000-0000-0000-000000000001'
$q$, 'calificación');

update products set final_condition_score = 8.5 where id = '10000000-0000-0000-0000-000000000001';
begin;
do $$ begin perform set_config('app.user_id', '00000000-0000-0000-0000-00000000000c', true); end $$;
update products set status = 'publicada' where id = '10000000-0000-0000-0000-000000000001';
commit;
do $$ begin
  if (select changed_by from product_status_history where to_status = 'publicada') is distinct from '00000000-0000-0000-0000-00000000000c' then
    raise exception 'El historial no registró quién publicó';
  end if;
end $$;
do $$ begin
  if (select published_at from products where id = '10000000-0000-0000-0000-000000000001') is null then
    raise exception 'published_at no se asignó';
  end if;
  if (select count(*) from product_status_history where product_id = '10000000-0000-0000-0000-000000000001') <> 8 then
    raise exception 'El historial de estados no registró todas las transiciones';
  end if;
end $$;

-- 5. Prevención de venta duplicada
insert into orders (id, buyer_id, delivery_method, subtotal_cents, total_cents)
values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'entrega_local', 800000, 800000),
       ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'entrega_local', 800000, 800000);
insert into order_items (order_id, product_id, price_cents)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 800000);
select expect_error($q$
  insert into order_items (order_id, product_id, price_cents)
  values ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 800000)
$q$, 'order_items_one_active_per_product');

-- 6. Total del pedido debe cuadrar
select expect_error($q$
  insert into orders (buyer_id, delivery_method, subtotal_cents, shipping_cents, total_cents)
  values ('00000000-0000-0000-0000-00000000000b', 'entrega_local', 100, 50, 100)
$q$, 'order_total_adds_up');

-- 7. Ledger: un asiento cuadrado se acepta
begin;
insert into ledger_transactions (id, kind, order_id, description)
values ('30000000-0000-0000-0000-000000000001', 'venta', '20000000-0000-0000-0000-000000000001', 'Venta P-0001');
insert into ledger_accounts (code, name, type, seller_id)
values ('por_pagar_vendedor:00000000-0000-0000-0000-00000000000a', 'Por pagar vendedor', 'pasivo', '00000000-0000-0000-0000-00000000000a');
insert into ledger_entries (transaction_id, account_id, debit_cents, credit_cents) values
  ('30000000-0000-0000-0000-000000000001', (select id from ledger_accounts where code = 'efectivo_procesador'), 800000, 0),
  ('30000000-0000-0000-0000-000000000001', (select id from ledger_accounts where code like 'por_pagar_vendedor:%'), 0, 560000),
  ('30000000-0000-0000-0000-000000000001', (select id from ledger_accounts where code = 'ingreso_comision'), 0, 240000);
commit;

-- 8. Ledger: un asiento descuadrado se rechaza al confirmar
create or replace function try_unbalanced() returns text language plpgsql as $$
begin
  insert into ledger_transactions (id, kind, description) values ('30000000-0000-0000-0000-000000000002', 'ajuste', 'malo');
  insert into ledger_entries (transaction_id, account_id, debit_cents) values
    ('30000000-0000-0000-0000-000000000002', (select id from ledger_accounts where code = 'efectivo_banco'), 100);
  insert into ledger_entries (transaction_id, account_id, credit_cents) values
    ('30000000-0000-0000-0000-000000000002', (select id from ledger_accounts where code = 'ingreso_comision'), 99);
  set constraints all immediate;
  return 'sin error';
exception when others then
  return sqlerrm;
end $$;
do $$ declare r text; begin
  r := try_unbalanced();
  if position('descuadrado' in r) = 0 then raise exception 'El ledger aceptó un asiento descuadrado: %', r; end if;
end $$;

-- 9. Ledger inmutable
select expect_error($q$ update ledger_entries set debit_cents = 1 $q$, 'inmutable');
select expect_error($q$ delete from ledger_entries $q$, 'inmutable');

-- 10. Comisión congelada debe sumar el precio
select expect_error($q$
  insert into order_commissions (order_item_id, seller_id, agreement_id, commission_rule_id, sale_price_cents, rate_bps, min_fee_cents, commission_cents, seller_gross_cents)
  select (select id from order_items limit 1), '00000000-0000-0000-0000-00000000000a',
         (select id from consignment_agreements limit 1), (select commission_rule_id from consignment_agreements limit 1),
         800000, 3000, 0, 240000, 500000
$q$, 'commission_adds_up');

-- 11. Saldo del vendedor y vista contable
do $$ begin
  if (select balance_cents from ledger_account_balances where code like 'por_pagar_vendedor:%') <> 560000 then
    raise exception 'El saldo por pagar al vendedor no es 560000';
  end if;
end $$;


-- 13. Permanencia mínima de 30 días y retiro del vendedor
update products set received_at = now() - interval '10 days' where id = '10000000-0000-0000-0000-000000000001';
select expect_error($q$
  insert into withdrawal_requests (product_id, requested_by)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a')
$q$, 'permanencia mínima');
select expect_error($q$
  insert into withdrawal_requests (product_id, requested_by)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b')
$q$, 'Solo el dueño');
-- Sin solicitud ni motivo de la empresa, una pieza publicada no se devuelve
select expect_error($q$
  update products set status = 'devolucion_pendiente' where id = '10000000-0000-0000-0000-000000000001'
$q$, 'solicitud de retiro');
update products set received_at = now() - interval '31 days' where id = '10000000-0000-0000-0000-000000000001';
insert into withdrawal_requests (product_id, requested_by)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a');
select expect_error($q$
  insert into withdrawal_requests (product_id, requested_by)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a')
$q$, 'withdrawal_requests_one_open');
do $$ begin
  if (select value from platform_settings where key = 'public.consignment_min_hold_days')::int <> 30 then
    raise exception 'La permanencia mínima no quedó en 30 días';
  end if;
end $$;


-- 12. La vista pública solo expone piezas en estados públicos
insert into products (seller_id, category_id, brand_id, model, declared_condition, asking_price_cents)
select '00000000-0000-0000-0000-00000000000a', 1, (select id from brands limit 1), 'Solicitud privada', 'bueno', 100000;
do $$ begin
  if (select count(*) from catalog_products) <> 1 then raise exception 'La vista pública debería mostrar 1 pieza'; end if;
  if (select authentication_result from catalog_products limit 1) <> 'autentica' then
    raise exception 'La vista no expone el resultado de autenticación';
  end if;
  if (select cover_url from catalog_products limit 1) is null then raise exception 'La vista no expone la portada'; end if;
end $$;

begin;
update products set status = 'devolucion_pendiente' where id = '10000000-0000-0000-0000-000000000001';
rollback;

-- 13. Fase 3B: entrega, SKU y autenticación fallida
select expect_error($q$
  insert into intake_plans (product_id, method, created_by)
  values ('10000000-0000-0000-0000-000000000001', 'sucursal', '00000000-0000-0000-0000-00000000000a')
$q$, 'intake_plan_details');
select expect_error($q$
  insert into intake_plans (product_id, method, scheduled_for, created_by)
  values ('10000000-0000-0000-0000-000000000001', 'recoleccion', now(), '00000000-0000-0000-0000-00000000000a')
$q$, 'intake_plan_details');
insert into intake_plans (product_id, method, created_by)
values ('10000000-0000-0000-0000-000000000001', 'paqueteria', '00000000-0000-0000-0000-00000000000a');
select expect_error($q$
  insert into intake_plans (product_id, method, scheduled_for, created_by)
  values ('10000000-0000-0000-0000-000000000001', 'sucursal', now(), '00000000-0000-0000-0000-00000000000a')
$q$, 'intake_plans_one_active');
select expect_error($q$
  insert into authentication_records (product_id, authenticator_id, result)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'no_autentica')
$q$, 'auth_failure_explained');
do $$ begin
  if nextval('product_sku_seq') < 1 then raise exception 'Falta la secuencia de SKU'; end if;
  if (select count(*) from legal_documents where kind = 'contrato_consignacion' and published_at is not null) < 1 then
    raise exception 'Falta el contrato de consignación publicado';
  end if;
  if (select value -> 'sucursal' ->> 'from_hour' from platform_settings where key = 'public.intake_options')::int <> 11 then
    raise exception 'Faltan las opciones de entrega';
  end if;
end $$;

select 'OK: todas las pruebas de base de datos pasaron' as resultado;
