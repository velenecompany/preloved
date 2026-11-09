# Arquitectura

Marketplace de consignación de moda de diseñador preloved. Basado en el prompt maestro v2.

## Principios

1. **Regla de oro.** Ninguna pieza se publica sin autenticación física aprobada, contrato aceptado, fotos finales y condición confirmada por persona. Se valida en TypeScript (`publishBlockers`) y se impone en la base de datos (trigger `enforce_product_status`), así que ni un error en el panel puede saltársela.
2. **Permanencia mínima de 30 días.** Desde que se recibe, la pieza no se puede retirar durante un mes (trigger en `withdrawal_requests`). Después, el vendedor decide si la retira o la deja publicada sin vencimiento.
3. **El dinero vive en una sola cuenta de la empresa.** La app no guarda dinero: lleva un ledger de doble entrada inmutable. A cada vendedor se le liquida por SPEI.
4. **Montos en centavos enteros.** Nunca decimales para dinero.
5. **Comisión congelada.** Se fija en el contrato (`consignment_agreements`) y se copia al pedido (`order_commissions`). Cambiar tarifas no altera ventas existentes.
6. **Sin datos ficticios.** Si no hay piezas o no hay base de datos conectada, la interfaz lo dice; nunca rellena.

## Stack

- Next.js 14 (App Router) + TypeScript estricto + Tailwind CSS 3, sobre `velenecompany/plantilla-base`
- PostgreSQL en Neon con `pg`; migraciones SQL propias (`db/migrations`, `scripts/migrate.mjs`)
- Deploy en Vercel desde GitHub (`velenecompany/preloved`)
- Autenticación (Fase 2): JWT en cookie de sesión con `jose`, contraseñas con `bcryptjs`, middleware de rutas
- Emails (Fase 2): Resend
- Fotos (Fase 3): Vercel Blob
- Evaluación de condición con IA (Fase 3): modelo de visión, salida JSON validada con Zod
- Pagos (Fase 4): Stripe Checkout + webhook, cobro a la cuenta de la empresa
- Zod para validar entradas en servidor; Vitest para la lógica de dominio

## Estructura de carpetas

```
app/                        Rutas (App Router)
  page.tsx                  Inicio
  catalogo/                 Catálogo con filtros por URL
  producto/[slug]/          Página de producto con la ficha de la pieza
  vender/                   Comisiones, permanencia y requisitos para consignar
  autenticidad/             Cómo autenticamos y escala de condición
  legal/[slug]/             Políticas (borradores con notas de revisión legal)
components/                 UI compartida (ficha, tarjetas, avisos) y layout/ (header, footer)
config/site.ts              Marca y contacto (variables NEXT_PUBLIC_*)
content/legal.ts            Borradores de políticas
lib/
  db.ts                     Pool de pg y transacciones con app.user_id para auditoría
  auth/                     Contraseñas (bcrypt), sesión JWT en cookie, tokens de correo, servicio de cuentas
  email.ts                  Envío con Resend y plantillas de correo
  storage.ts                Fotos: Vercel Blob en producción, carpeta .uploads en desarrollo
  consignment/              Servicio de solicitudes, esquemas, evaluación con IA (Groq visión)
  catalog.ts                Consultas del catálogo (solo servidor)
  domain/                   Lógica pura, sin dependencias de framework
    money.ts                Centavos, puntos base, formato MXN
    commissions.ts          Reglas por grupo y rango, cálculo, validación
    state-machines.ts       Pieza, pedido y dinero + regla de publicación
    consignment.ts          Permanencia mínima y retiro
    ledger.ts               Asientos de venta, liquidación y reembolso
    clabe.ts                Validación de CLABE
    labels.ts               Textos en español de los enums
db/
  migrations/               001 esquema, 002 vista del catálogo, 003 configuración, 004 permanencia
  tests/integration.sql     Pruebas de reglas de base de datos
scripts/                    migrate.mjs, make-admin.mjs y test-db.sh
middleware.ts               Exige sesión válida en /cuenta y /admin
```

## Máquinas de estado

**Pieza:** `solicitud_borrador → solicitud_enviada → preaprobada → pendiente_de_entrega → recibida → en_autenticacion → pendiente_de_contrato → pendiente_de_fotografia → publicada → reservada → vendida → entregada → en_ventana_de_aceptacion → cerrada`, con ramas a `requiere_informacion`, `rechazada`, `autenticacion_fallida`, `devolucion_pendiente`, `devuelta_al_vendedor` y `retirada_por_vendedor`. La fuente de verdad es `state-machines.ts`; la migración tiene la misma tabla y una prueba verifica que coincidan.

**Dinero por venta:** `pendiente → cobrado → retenido → disponible → en_lote_de_pago → liquidado`, con `en_disputa` y `reembolsado`. Pasa a `disponible` al terminar la ventana de 72 horas sin reclamo y se paga ese mismo día. No se puede reembolsar dinero ya liquidado ni en lote.

**Pedido:** `pendiente_pago → pagado → en_preparacion → en_camino → entregado → en_ventana_aceptacion → cerrado`, con `en_disputa`, `cancelado` y `reembolsado`.

## Ledger

Tablas `ledger_accounts`, `ledger_transactions`, `ledger_entries`. Garantías en base de datos:

- Cada línea es débito o crédito, nunca ambos.
- Al confirmar la transacción, cada asiento debe cuadrar (trigger diferido).
- Las filas no se pueden modificar ni borrar; las correcciones son asientos de reversa.

Asiento de una venta de $8,000 (bolso, 30 %): débito `efectivo_procesador` $8,000; crédito `por_pagar_vendedor:{id}` $5,600; crédito `ingreso_comision` $2,400; y la comisión real de Mercado Pago como débito a `gasto_procesador` y crédito a `efectivo_procesador`.

## Seguridad

- Neon no tiene seguridad por fila por usuario: la autorización vive en el servidor. Las páginas públicas solo consultan la vista `catalog_products`, que ya filtra estados públicos.
- Las reglas críticas están en la base de datos y no dependen del código: transiciones de estado válidas, regla de oro de publicación, permanencia mínima, ventas duplicadas imposibles (índice único parcial), ledger cuadrado e inmutable, bitácora inmutable.
- Los cambios de estado se hacen dentro de `transaction(fn, userId)`, que fija `app.user_id` para que el historial registre quién hizo cada cambio.
- Montos, comisiones y precios se calculan solo en servidor; el cliente nunca envía montos que se acepten tal cual.
- Contraseñas con bcrypt (costo 12). Tokens de verificación y recuperación de un solo uso, guardados como hash SHA-256.
- Sesión: JWT HS256 en cookie httpOnly de 30 días. Incluye `session_version`; al cambiar o restablecer la contraseña, o al suspender una cuenta, todas las sesiones anteriores dejan de servir.
- Login limitado a 5 intentos fallidos por correo y 20 por IP cada 15 minutos. El mensaje de error no revela si el correo existe.
- Cambiar la CLABE pide la contraseña y avisa por correo. Solo cuentas con correo confirmado pueden registrar datos bancarios.
- Roles de personal solo los asigna un administrador; queda registrado quién los dio. Siempre debe quedar al menos un administrador.

## Integraciones y variables

Ver `.env.example`. Neon (Fase 1), JWT y Resend (Fase 2), Vercel Blob e IA de visión (Fase 3), Stripe (Fase 4). La transferencia automática a vendedores queda como interfaz `PayoutProvider` sin implementar; mientras tanto, finanzas paga por SPEI el mismo día en que el dinero se libera.

## Estado por fase

| Fase | Estado |
|---|---|
| Arquitectura, esquema, máquinas de estado, comisiones, ledger, permanencia mínima | Hecho y probado |
| 1. Landing, catálogo con filtros, producto, políticas | Hecho |
| 2. Autenticación, perfiles, roles, datos de liquidación | Hecho y probado de punta a punta |
| 3A. Solicitud de consignación, fotos, prueba de posesión, IA, revisión y respuesta del vendedor | Hecho y probado de punta a punta |
| 3B. Cita de entrega, recepción, autenticación física, contrato, fotos finales y publicación | Pendiente |
| 4. Compra, Mercado Pago, webhooks, ledger en vivo | Pendiente |
| 5. Entrega, ventana de aceptación, disputas, liquidaciones | Pendiente |
| 6. Finanzas y reportes | Pendiente |
| 7. Endurecimiento y envío nacional | Pendiente |

**Mientras tanto (piloto):** el botón de la pieza es "Apartar por WhatsApp" y la solicitud de consignación se recibe por WhatsApp. Las piezas se cargan directo en Neon por el personal siguiendo el flujo de estados. Los favoritos y la compra en línea llegan con las fases 2 y 4.

## Solicitudes de consignación (Fase 3A)

1. El vendedor (correo confirmado) llena los datos de la pieza; se crea un borrador con un código de posesión `RL-XXXXX`.
2. Sube fotos por toma según la categoría (calzado pide suelas, bolsos pide interior). El navegador las reduce a 2000 px en JPEG antes de subir. En producción van directo a Vercel Blob con permiso emitido por `/api/fotos/subir`, solo dentro de `solicitudes/{vendedor}/{pieza}/`.
3. Sube la foto de la pieza con el código escrito a mano. Sin las obligatorias y sin esa foto no puede enviar.
4. Al enviar se abre una ronda en `consignment_requests` y el navegador pide la lectura con IA (`/api/solicitudes/[id]/evaluar`, hasta 60 s). La IA solo describe condición visible; su salida se valida con Zod y se filtran frases sobre autenticidad.
5. El equipo (admin o autenticador) responde: preaprobar con precio y comisión, pedir información o rechazar. Cada respuesta manda correo.
6. El vendedor acepta (requiere datos bancarios), contrapropone (máximo 4 rondas) o retira. Al aceptar, la pieza pasa a `pendiente_de_entrega`.

Las fotos de solicitud son públicas en Blob pero con nombre aleatorio no adivinable; solo se muestran a su dueño y al equipo.
