# Marketplace preloved de diseñador

Consignación de moda de diseñador en Guadalajara: cada pieza se recibe, se autentica físicamente y se fotografía antes de publicarse. La arquitectura completa está en [ARQUITECTURA.md](./ARQUITECTURA.md).

Stack: Next.js 14, TypeScript, Tailwind CSS, PostgreSQL en Neon, Vercel. Basado en `velenecompany/plantilla-base`.

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # llena DATABASE_URL con la cadena pooled de Neon
npm run db:migrate           # aplica db/migrations en orden, una sola vez cada una
npm run dev
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor local en `localhost:3000` |
| `npm run build` | Compila como en Vercel |
| `npm test` | Pruebas de comisiones, ledger, estados, permanencia y CLABE |
| `npm run typecheck` | Revisión de TypeScript |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Aplica migraciones pendientes en la base de `DATABASE_URL` |
| `./scripts/test-db.sh` | Pruebas de reglas de base de datos en un PostgreSQL local (nunca contra Neon de producción) |

## Migraciones

Cada cambio de base de datos es un archivo nuevo en `db/migrations/` con número consecutivo (`005_...sql`). Nunca se edita una migración ya aplicada. `migrate.mjs` registra las aplicadas en la tabla `schema_migrations`.

## Primer administrador

Cuando exista el registro (Fase 2), asígnate el rol desde la consola SQL de Neon:

```sql
insert into user_roles (user_id, role)
select id, 'admin' from users where lower(email) = lower('tu@correo.com');
```

## Antes de operar

- Revisa con un abogado los textos de `content/legal.ts` (cada punto pendiente está marcado). Cuando estén aprobados, pon `NEXT_PUBLIC_SHOW_LEGAL_REVIEW_NOTES=false`.
- Confirma con un contador la figura fiscal y las retenciones. Están desactivadas en `platform_settings.tax_withholding` hasta entonces.
- Carga los códigos postales con cobertura en `coverage_zones` y las marcas aceptadas en `brands`.
