# Plan: Módulo "Tareas y Pendientes" (inventario-app)

## Contexto

El sistema de inventario necesita un módulo de gestión de tareas con fecha límite obligatoria,
subtareas (1 nivel), asignación a perfiles internos o actores externos, seguimiento global desde
los perfiles 001/002, alertas de atraso y reporte imprimible. Hoy no existe nada de esto.

**Alcance acordado con el usuario:** se implementan las **Fases 1 a 4** (DB + CRUD + vistas/filtros/
impresión + badge in-app + integración con /obras). La **Fase 5 (push notifications)** queda solo
*documentada/preparada* pero NO se implementa ahora, porque requiere `web-push`, claves VAPID, 5
variables de entorno en Vercel, un service worker e íconos PNG que no existen y que no se pueden
probar en este entorno sin esos secretos.

### Decisiones de diseño (reconciliadas con el código real)

1. **Ruta del módulo:** `/pendientes` (consistente con el label "Pendientes").
2. **Identidad por perfil:** se agrega columna `profiles.username` ('001'..'005') poblada desde el
   prefijo del email `NNN@inventario.local`, más helper SQL `get_my_username()`. Necesario porque
   001/002 son ambos `admin` y 003/004 ambos `supervisor`; el rol solo no alcanza para las reglas.
3. **UUID:** `gen_random_uuid()` (convención de la última migración `20260609120000_add_combustible.sql`),
   NO `uuid_generate_v4()`. SQL en minúsculas, igual que el resto.
4. **`updated_at`:** cada tabla con su propia función de trigger (patrón existente, p.ej.
   `update_supplier_timestamp`). Aquí: `update_task_timestamp()` + `trg_task_updated_at`.
5. **shadcn faltantes:** NO existen `tabs`, `progress`, `table`, ni date-picker en `components/ui/`.
   Se reutilizan los que SÍ existen (`card`, `badge`, `button`, `dialog`, `select`, `input`,
   `label`, `textarea`, `separator`, `toast/toaster`) y se construye lo faltante con HTML simple:
   - fecha → `<input type="date">` (mismo patrón que `combustible/nueva`),
   - barra de progreso → `<div>` con ancho %,
   - toggle de vista y tablas → botones + `<table>` plano.
6. **Estado `vencida`:** el enum incluye `'vencida'`, pero los **conteos y la UI calculan el atraso
   de forma dinámica** (`due_date < current_date AND status IN ('pendiente','en_progreso')`) para no
   depender de un job diario. Se incluye además una función `mark_overdue_tasks()` que persiste el
   estado; su agendado diario (pg_cron / Vercel cron) se hará junto con la Fase 5.
7. **Autorización:** RLS en DB para *visibilidad y propiedad de filas* (usando `get_my_role()` +
   `get_my_username()`); las reglas de *mutación específicas* (solo admin mueve `due_date`; solo 002
   actualiza progreso de externos; profundidad de subtarea; fijar responsable) se validan en los
   **API routes** server-side, como pide la spec. Defensa en profundidad.
8. **Menú celular:** se **reemplaza** la pestaña `/compras` por `/pendientes` en admin/supervisor
   (Compras sigue en el sidebar) y se **agrega** `/pendientes` al menú de la contadora (trabajador).

---

## 1. Migraciones de base de datos

Dos archivos nuevos en `supabase/migrations/` (SQL en minúsculas, `gen_random_uuid()`).

### `20260615210000_add_profile_username.sql`
- `alter table profiles add column username text unique;`
- Poblar desde el email de `auth.users`:
  `update profiles p set username = split_part(u.email, '@', 1) from auth.users u where u.id = p.id;`
- Helper:
  ```sql
  create or replace function get_my_username()
  returns text as $$ select username from profiles where id = auth.uid() $$
  language sql security definer stable;
  ```

### `20260615210100_tasks_module.sql`
**Enums:**
```sql
create type task_status as enum ('pendiente', 'en_progreso', 'completada', 'vencida');
create type task_priority as enum ('alta', 'media', 'baja');
```

**Tablas** (en orden de dependencia): `external_actors` → `tasks` → `task_history` → `push_subscriptions`.

- `external_actors`: `id uuid pk default gen_random_uuid()`, `name text not null`,
  `type text not null check (type in ('arquitecto','contratista','proveedor','otro'))`,
  `phone text`, `company text`, `notes text`, `is_active boolean not null default true`,
  `created_by uuid references profiles(id)`, `created_at timestamptz not null default now()`.

- `tasks`:
  `id`, `title text not null`, `description text`,
  `status task_status not null default 'pendiente'`,
  `priority task_priority not null default 'media'`,
  `due_date date not null`,
  `assigned_to_profile uuid references profiles(id)`,
  `assigned_to_external uuid references external_actors(id)`,
  `location_id uuid references locations(id)`,
  `parent_task_id uuid references tasks(id) on delete cascade`,
  `created_by uuid not null references profiles(id)`,
  `completed_at timestamptz`, `created_at`, `updated_at`,
  `check ((assigned_to_profile is null) <> (assigned_to_external is null))`  ← exactamente uno.

- `task_history`: `id`, `task_id uuid references tasks(id) on delete cascade`,
  `changed_by uuid references profiles(id)`, `field_changed text`, `old_value text`,
  `new_value text`, `changed_at timestamptz not null default now()`.

- `push_subscriptions`: `id`, `profile_id uuid references profiles(id) on delete cascade`,
  `endpoint text unique not null`, `p256dh text not null`, `auth text not null`, `created_at`.
  (Tabla creada ahora; su uso es Fase 5.)

**Índices:** `idx_tasks_assigned_to_profile`, `idx_tasks_assigned_to_external`,
`idx_tasks_location_id`, `idx_tasks_parent_task_id`, `idx_tasks_due_date`, `idx_tasks_status`,
`idx_task_history_task_id`.

**Triggers/funciones:**
- `update_task_timestamp()` + `trg_task_updated_at before update on tasks`.
- `trg_tasks_no_subsubtask before insert or update on tasks`: si `new.parent_task_id is not null`
  y el padre ya tiene `parent_task_id not null` → `raise exception` (defensa DB para 1 nivel).
- `mark_overdue_tasks()`: `update tasks set status='vencida' where due_date < current_date and
  status in ('pendiente','en_progreso')`. (Agendado en Fase 5.)
- `get_my_overdue_count()` `security definer`: devuelve el conteo de vencidas según el usuario
  (admin→todas; 004→las de 001; resto→`assigned_to_profile = auth.uid()`), calculado dinámicamente.
  Lo consume `layout.tsx` para el badge.

**RLS (habilitar en las 4 tablas) — políticas por rol:**

`external_actors`
- select: `to authenticated using (true)` (para mostrar nombres de asignados).
- insert/update/delete: `using/with check (get_my_role() = 'admin')`.

`tasks`
- select `using (`
  `get_my_role() = 'admin'`
  `or assigned_to_profile = auth.uid()`
  `or (get_my_username() = '004' and assigned_to_profile = (select id from profiles where username='001'))`
  `)`
- insert `with check (created_by = auth.uid() and (`
  `get_my_role() = 'admin'`
  `or (get_my_username() in ('003','005') and assigned_to_profile = auth.uid())`
  `or (get_my_username() = '004' and assigned_to_profile = (select id from profiles where username='001'))`
  `))`
- update `using (` *mismas condiciones que insert, sin el `created_by`* `)` (admin / propias / 004→001).
- delete `using (get_my_role() = 'admin')`.

`task_history`
- select: `using (exists (select 1 from tasks t where t.id = task_history.task_id))`
  (la RLS de `tasks` ya restringe qué filas son visibles dentro del subquery).
- insert: `with check (changed_by = auth.uid())`. Sin update/delete (inmutable).

`push_subscriptions`
- select/insert/delete: `using/with check (profile_id = auth.uid())`.

---

## 2. Tipos TypeScript (`types/database.ts`)

Agregar (siguiendo el estilo existente: PascalCase, `string | null` para nullable, `// joins`):

```ts
export type TaskStatus = 'pendiente' | 'en_progreso' | 'completada' | 'vencida'
export type TaskPriority = 'alta' | 'media' | 'baja'
export type ExternalActorType = 'arquitecto' | 'contratista' | 'proveedor' | 'otro'

export interface ExternalActor { id; name; type: ExternalActorType; phone: string|null;
  company: string|null; notes: string|null; is_active: boolean; created_by: string|null; created_at }

export interface Task {
  id; title; description: string|null; status: TaskStatus; priority: TaskPriority; due_date: string;
  assigned_to_profile: string|null; assigned_to_external: string|null; location_id: string|null;
  parent_task_id: string|null; created_by: string; completed_at: string|null; created_at; updated_at;
  // joins
  assigned_profile?: Pick<Profile,'id'|'full_name'> | null
  assigned_external?: Pick<ExternalActor,'id'|'name'|'type'> | null
  location?: Pick<Location,'id'|'name'|'type'> | null
  subtasks?: Task[]
}

export interface TaskHistory { id; task_id; changed_by: string|null; field_changed: string|null;
  old_value: string|null; new_value: string|null; changed_at }
export interface PushSubscription { id; profile_id; endpoint; p256dh; auth; created_at }
```
- Añadir `username: string | null` a `interface Profile`.
- Registrar en `interface Database`: Tables (`tasks`, `external_actors`, `task_history`,
  `push_subscriptions` con sus `Row/Insert/Update`), Enums (`task_status`, `task_priority`), y
  Functions (`get_my_username`, `get_my_overdue_count`, `mark_overdue_tasks`).

---

## 3. Archivos a crear

| Ruta | Tipo | Responsabilidad |
|---|---|---|
| `app/(app)/pendientes/page.tsx` | Server | Lee `searchParams` (vista/status/prioridad/persona/obra/desde/hasta), query de tasks con joins + perfiles + externos + obras, agrupa por persona/obra, pasa todo a `PendientesClient`. |
| `app/(app)/pendientes/PendientesClient.tsx` | Client | Vista principal: toggle Persona/Obra, bloques "Personales/De trabajo" para 001, cards expandibles, barra de progreso, botón Imprimir. |
| `app/(app)/pendientes/nueva/page.tsx` | Server | Carga opciones (perfiles, externos activos, obras, tareas padre sin `parent_task_id`) + perfil actual; renderiza `TaskForm` modo crear. |
| `app/(app)/pendientes/[id]/editar/page.tsx` | Server | Carga la tarea + opciones; renderiza `TaskForm` modo editar. |
| `app/(app)/pendientes/externos/page.tsx` | Server | Listado de actores externos (solo admin) + `ExternalActorsManager`. |
| `components/pendientes/TaskForm.tsx` | Client | Form compartido crear/editar. Zod. Selector de responsable según rol/username (001/002 libre; 003/005 fijo a sí mismo; 004 fijo a 001). Campos: título, descripción, prioridad, `due_date` (deshabilitado si rol≠admin al editar), obra opcional, tarea padre opcional. POST/PATCH a API. |
| `components/pendientes/TaskFilters.tsx` | Client | Filtros en URL params (`URLSearchParams` + `router.push`), patrón de `ObraSelector`. |
| `components/pendientes/ViewToggle.tsx` | Client | Alterna `?vista=persona|obra`. |
| `components/pendientes/PersonCard.tsx` | Client | Card expandible por persona/externo: nombre, rol/tipo, total pendientes, badge rojo de vencidas, barra de progreso, lista inline. |
| `components/pendientes/TaskRow.tsx` | Client | Fila de tarea: badges estado/prioridad, due_date, acciones (link Editar, botón "Completar"→PATCH, expandir subtareas). |
| `components/pendientes/StatusBadge.tsx` / `PriorityBadge.tsx` | Server | Presentacionales sobre `Badge`. |
| `components/pendientes/PrintView.tsx` | Server | Tabla imprimible (`print:block`, oculta en pantalla): encabezado "Pendientes — fecha", columnas Tarea/Responsable/Fecha límite/Estado/Notas, agrupada por persona. |
| `components/pendientes/ExternalActorsManager.tsx` | Client | CRUD de externos (Dialog + form). |
| `app/api/tasks/route.ts` | API | `POST` crear tarea: Zod, valida XOR de asignado, profundidad de subtarea, fija responsable según rol/username, inserta. |
| `app/api/tasks/[id]/route.ts` | API | `PATCH` editar (carga rol+username; `due_date` solo admin; status de externos solo username 002; setea `completed_at` al completar; escribe `task_history`). `DELETE` solo admin. |
| `app/api/external-actors/route.ts` | API | `POST` crear externo (solo admin). |
| `app/api/external-actors/[id]/route.ts` | API | `PATCH`/`DELETE` externo (solo admin). |
| `CLAUDE.md` (raíz) | Doc | Crear el archivo con el contenido de la Sección 1 del encargo (no existe hoy); actualizar nav y marcar el módulo como implementado. |

Helper sugerido `lib/auth.ts` (opcional): función `getProfileContext(supabase)` que devuelve `{ id, role, username }` reutilizable por los API routes.

---

## 4. Archivos a modificar

| Archivo | Cambio puntual |
|---|---|
| `components/layout/Sidebar.tsx` | Añadir `overdueCount?: number` a `SidebarProps`. Importar icono `CheckSquare` de `lucide-react`. Insertar en `mainNavItems` en **posición 2** (tras Dashboard): `{ href:"/pendientes", label:"Pendientes", icon:CheckSquare }`. Al renderizar ese item, si `overdueCount > 0` mostrar un círculo rojo con el número junto al label. |
| `components/layout/MobileNav.tsx` | En `adminTabs`: **reemplazar** `{ href:"/compras", ... }` por `{ href:"/pendientes", label:"Tareas", icon:CheckSquare }`. En `workerTabs`: **agregar** `{ href:"/pendientes", label:"Tareas", icon:CheckSquare }` (queda en grid-cols-4; ajustar `grid-cols-*` en consecuencia). Importar `CheckSquare`. |
| `app/(app)/layout.tsx` | Tras obtener `profile`, llamar `const { data: overdueCount } = await supabase.rpc('get_my_overdue_count')` y pasar `overdueCount={overdueCount ?? 0}` a `<Sidebar>`. Envolver `<Sidebar/>` y `<MobileNav/>` con clase `print:hidden` (y `<main>` sin restricciones) para la vista de impresión. |
| `app/(app)/obras/page.tsx` | Cuando `obraId` esté presente, query adicional: `tasks` con `location_id = obraId` (+ join responsable). Renderizar al final sección "Tareas de esta obra" (lista compacta: título, responsable, due_date, badge estado) y botón "Nueva tarea" → `/pendientes/nueva?obra=<obraId>`. Reutiliza `TaskRow`/`StatusBadge`. |
| `app/globals.css` | Reglas `@media print`: ocultar elementos `.print\:hidden`, mostrar `.print\:block`, quitar márgenes/sombras de cards, fondo blanco. |
| `types/database.ts` | (ver Sección 2). |

`components/obras/` puede recibir un subcomponente `ObraTasksSection.tsx` (Server) si la página obras
delega el render — seguir el estilo de los componentes existentes en `components/obras/`.

---

## 5. Componentes UI

- **Reutilizar de `components/ui/`:** `card`, `badge`, `button`, `dialog`, `select`, `input`,
  `label`, `textarea`, `separator`, `toast`/`toaster` (vía `hooks/use-toast`).
- **Construir a mano (no hay primitivo shadcn):** date input nativo (como `combustible/nueva`),
  barra de progreso (`<div>` con `width`), toggle de vista (botones + URL), tablas (`<table>` plano).
- **Patrón de filtros:** copiar `components/obras/ObraSelector.tsx` (usa
  `useRouter`+`useSearchParams`+`URLSearchParams`).
- **Patrón de form:** copiar `app/(app)/combustible/nueva/page.tsx` (Zod `safeParse`, `useState`,
  sin librería de formularios, `createClient()` del browser o `fetch` al API route).

---

## 6. Service worker y push (Fase 5 — solo preparado, NO implementar ahora)

Documentar en `CLAUDE.md` los pasos y dependencias para cuando se provisionen secretos:
`public/sw.js` (eventos `push`/`notificationclick`), `app/api/push/subscribe/route.ts`,
`app/api/push/send/route.ts` (auth `Bearer CRON_SECRET`), `app/api/cron/task-reminders/route.ts`,
entrada en `vercel.json` (`"0 14 * * *"`), componente `PushNotificationSetup` montado en layout
(solo rol≠trabajador), `npm i web-push @types/web-push` con **import dinámico** de `web-push` dentro
del handler (evitar que el bundler de Next lo incluya en el edge/cliente), y variables
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `CRON_SECRET`.
También se requieren íconos reales `public/icon-192.png` (hoy no existen). La tabla
`push_subscriptions` y `mark_overdue_tasks()` ya quedan creadas desde la Fase 1.

---

## 7. Orden de implementación (Fases 1–4)

**Fase 1 — Base funcional (DB + CRUD + lista básica):**
1. `supabase/migrations/20260615210000_add_profile_username.sql`
2. `supabase/migrations/20260615210100_tasks_module.sql`
3. `types/database.ts` (tipos nuevos + `username` en Profile)
4. `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`
5. `app/api/external-actors/route.ts`, `app/api/external-actors/[id]/route.ts`
6. `components/pendientes/TaskForm.tsx`, `StatusBadge.tsx`, `PriorityBadge.tsx`, `TaskRow.tsx`
7. `app/(app)/pendientes/page.tsx` (lista simple sin filtros), `nueva/page.tsx`, `[id]/editar/page.tsx`
8. `CLAUDE.md` (crear)

**Fase 2 — Vistas completas (persona/obra, filtros URL, impresión):**
1. `components/pendientes/ViewToggle.tsx`, `TaskFilters.tsx`, `PersonCard.tsx`
2. `components/pendientes/PendientesClient.tsx`, `PrintView.tsx`
3. Reescribir `app/(app)/pendientes/page.tsx` para leer todos los `searchParams` y agrupar
4. `app/globals.css` (estilos `@media print`)
5. `app/(app)/pendientes/externos/page.tsx` + `ExternalActorsManager.tsx`

**Fase 3 — Badge in-app:**
1. `app/(app)/layout.tsx` (RPC `get_my_overdue_count` + `print:hidden`)
2. `components/layout/Sidebar.tsx` (prop `overdueCount` + item `/pendientes` + círculo rojo)
3. `components/layout/MobileNav.tsx` (reemplazar Compras→Pendientes; agregar a trabajador)

**Fase 4 — Integración con /obras:**
1. `app/(app)/obras/page.tsx` (query de tasks por `location_id` + sección "Tareas de esta obra")
2. `components/obras/ObraTasksSection.tsx` (si se delega el render) + botón "Nueva tarea" con `?obra=`

---

## 8. Verificación

- **Build/lint:** `npm run build` y `npm run lint` deben pasar sin errores de tipos.
- **Migraciones:** aplicar las 2 migraciones a Supabase y verificar que `tasks`, `external_actors`,
  `task_history`, `push_subscriptions` existen, que `profiles.username` quedó poblado ('001'..'005'),
  y que `get_my_username()` / `get_my_overdue_count()` responden.
- **Permisos (probar con cada login `NNN@inventario.local`):**
  - 001/002 ven todas; 003/005 solo las propias; 004 solo las de 001.
  - 003/005 al crear quedan fijados a sí mismos; 004 fijado a 001; due_date editable solo por admin.
  - Cambiar status de una tarea de externo solo funciona logueado como 002.
  - Eliminar tarea solo admin; CRUD de externos solo admin.
  - Intentar crear sub-subtarea (padre con `parent_task_id`) debe ser rechazado por API y por trigger.
- **Vistas:** toggle Persona/Obra; bloques Personales/De trabajo para 001; filtros URL
  (`?status=&prioridad=&persona=&obra=&desde=&hasta=`) reflejados en datos; badge rojo de vencidas.
- **Impresión:** `window.print()` oculta sidebar/nav/botones/filtros y muestra la tabla por persona;
  si hay filtro activo, solo esa sección.
- **Badge sidebar:** crear una tarea con `due_date` pasada y confirmar el círculo rojo con el conteo
  correcto según el usuario.
- **Integración /obras:** en `/obras?obra=<id>` aparece "Tareas de esta obra"; "Nueva tarea"
  pre-rellena la obra; la tarea creada se ve tanto en /obras como en /pendientes (misma tabla).
- **Manual (skill `run`):** `npm run dev`, recorrer crear → editar → completar → imprimir.
