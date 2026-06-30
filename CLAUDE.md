# inventario-app — guía de codebase

## Stack
- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4
- shadcn/ui (componentes en `components/ui/`)
- Supabase (auth, Postgres, Storage)
- Zod v4 para validación

## Autenticación y roles
- Server: `createClient()` de `@/lib/supabase/server`
- Client: `createClient()` de `@/lib/supabase/client`
- Roles: `admin` | `supervisor` | `trabajador`
- Usernames: 001–005 en columna `profiles.username` (prefijo de email `NNN@inventario.local`)
  - 001, 002 = admin; 003, 004 = supervisor; 005 = trabajador
- Función DB: `get_my_role()`, `get_my_username()`

## Módulos principales
| Ruta | Descripción |
|---|---|
| `/dashboard` | Vista general |
| `/items` | Inventario |
| `/movements/new` | Registrar movimiento |
| `/obras` | Gastos por obra + tareas de la obra |
| `/pendientes` | Módulo de tareas y pendientes |
| `/combustible` | Registro de cargas de combustible |
| `/cash` | Caja chica |
| `/compras` | Pedidos de compra |
| `/gastos` | Gastos mensuales |

## Módulo Pendientes (`/pendientes`)
Implementado en fases 1–4. **Fase 5 (push notifications) pendiente** de secretos VAPID.

### Archivos clave
- `supabase/migrations/20260615210000_add_profile_username.sql` — columna username + helper
- `supabase/migrations/20260615210100_tasks_module.sql` — tablas tasks, external_actors, task_history, push_subscriptions + RLS + funciones
- `app/api/tasks/route.ts` — POST crear tarea
- `app/api/tasks/[id]/route.ts` — PATCH editar, DELETE eliminar
- `app/api/external-actors/` — CRUD actores externos (solo admin)
- `components/pendientes/` — todos los componentes del módulo
- `app/(app)/pendientes/` — rutas del módulo

### Reglas de negocio (validadas en API routes)
- 001/002 (admin): libre asignación a cualquier perfil o externo
- 003/005: solo pueden asignarse tareas a sí mismos
- 004: solo puede asignar tareas al perfil 001
- `due_date`: solo admin puede editarla
- Status de tareas de externo: solo 002 puede actualizar
- Subtareas: máximo 1 nivel de profundidad (validado en DB trigger + API)
- Eliminar tarea: solo admin

### Badge de vencidas
El layout llama `get_my_overdue_count()` (RPC) y pasa el conteo al Sidebar. El cálculo es dinámico (no depende de un job).

## Patrones de código
- Server components: `await searchParams` / `await params` (Next.js 16)
- API route params: `context: { params: Promise<{ id: string }> }` → `const { id } = await context.params`
- Formularios: estado local + validación manual o Zod, `fetch` a API route
- Filtros URL: `URLSearchParams` + `router.push` (patrón `ObraSelector`)
- Shadcn faltantes: usar HTML plano (`<input type="date">`, `<select>`, `<div>` para progress)
- Impresión: `print:hidden` / `print:block` de Tailwind; PrintView se muestra solo al imprimir

## Migraciones pendientes de aplicar en Supabase
1. `20260615210000_add_profile_username.sql`
2. `20260615210100_tasks_module.sql`

Aplicar con: Supabase Dashboard → SQL Editor, o `supabase db push` si hay CLI configurado.

## Fase 5 — Push notifications (NO implementada)
Requiere: `web-push`, claves VAPID (5 vars en Vercel), service worker `public/sw.js`, íconos PNG.
La tabla `push_subscriptions` ya existe. Ver sección 6 del plan original en `docs/plan-tareas-pendientes.md`.
