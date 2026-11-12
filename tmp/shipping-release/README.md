# Soporte Tectronic

Sistema React + Supabase para consultar garantías por folio o número de serie y administrar soportes de impresoras.

## Stack

- Vite + React + TypeScript
- React Router
- TanStack Query
- React Hook Form + Zod
- Supabase Auth + Postgres + RLS

## Configuración

1. Crea el archivo `.env.local` usando `.env.example`.
2. En Supabase, abre el proyecto `soporte_tectronic`.
3. Ejecuta `supabase/migrations/001_initial_support_schema.sql` en el SQL editor.
4. Opcional: ejecuta `supabase/seed.sql` para cargar la serie demo `RT420ME2110250411`.
5. Crea manualmente tu usuario admin en Authentication > Users.

Variables:

```env
VITE_SUPABASE_URL=https://sqzrvzwyvjeosuvzotja.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=tu_publishable_key_o_anon_key
ODOO_URL=https://tu-instancia.odoo.com
ODOO_DB=nombre_real_de_la_base_de_datos
USER_ODOO=usuario@empresa.com
API_KEY_ODOO=api_key_generada_en_odoo
```

`Reportes` y `Cotizador` comparten `supabase/functions/_shared/odoo-readonly.ts`.
El conector solo permite `search_read` y `fields_get`. En produccion se recomienda
definir `ODOO_DB`; si no existe, el conector obtiene el nombre publicado por la
instancia antes de autenticar.

El panel `/admin` permite administrar a cualquier usuario creado en Authentication > Users.
El mÃ³dulo `Reportes` consulta ventas de Odoo. En desarrollo lee `ODOO_URL`, `USER_ODOO` y `API_KEY_ODOO` desde `.env.local`; para producciÃ³n, configura esas mismas variables como secrets en la Edge Function `odoo-sales-report`.

## Rutas

- `/`: consulta pública por folio o número de serie.
- `/admin`: login y panel administrativo para registrar soportes.

## Comandos

```bash
npm install
npm run dev
npm run build
```

## Nota de seguridad

La consulta publica lee `support_cases` y `support_events` desde el cliente para poder buscar por serie sin backend adicional. Si quieres evitar que el anon key pueda listar registros desde la API, el siguiente paso recomendado es mover la consulta publica a una Edge Function y dejar las tablas solo para usuarios autenticados.
