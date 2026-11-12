-- La Alcancía: tablas en Supabase (PostgreSQL).
-- Cada fila tiene user_id y solo su dueño la puede ver o cambiar (Row Level Security).
-- Se puede volver a correr: no borra datos.

create table if not exists public.configuracion (
  user_id       uuid primary key default auth.uid() references auth.users on delete cascade,
  configurado   boolean not null default false,
  dias_semana   int     not null default 6     check (dias_semana between 1 and 7),
  margen        int     not null default 2     check (margen between 0 and 7),
  cuota_diaria  numeric not null default 40000 check (cuota_diaria >= 0),
  fuentes       text[]  not null default array['InDrive'],
  extra         numeric not null default 0,
  actualizado   timestamptz not null default now()
);

create table if not exists public.obligaciones (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  nombre       text not null,
  tipo         text not null check (tipo in ('mensual', 'semanal', 'unica')),
  dia          int,
  fecha        date,
  monto        numeric not null default 0,
  apartado     numeric not null default 0,
  prioridad    int     not null default 2 check (prioridad between 1 and 3),
  saldo_total  numeric,
  inicio       date,
  proximo      date,
  activa       boolean not null default true,
  nota         text not null default '',
  actualizado  timestamptz not null default now()
);

create table if not exists public.registros (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  fecha        date not null,
  ingresos     jsonb   not null default '{}',
  ingreso      numeric not null default 0,
  gasolina     numeric not null default 0,
  otros        numeric not null default 0,
  carro        numeric not null default 0,
  apartado     numeric not null default 0,
  reparto      jsonb   not null default '{}',
  extra        numeric not null default 0,
  nota         text    not null default '',
  actualizado  timestamptz not null default now()
);

create table if not exists public.pagos (
  id             text primary key,
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  fecha          date not null,
  obligacion_id  text,
  nombre         text not null default '',
  monto          numeric not null default 0,
  antes          jsonb,
  actualizado    timestamptz not null default now()
);

create index if not exists obligaciones_user_idx on public.obligaciones (user_id);
create index if not exists registros_user_fecha_idx on public.registros (user_id, fecha);
create index if not exists pagos_user_fecha_idx on public.pagos (user_id, fecha);

-- Seguridad: cada quien solo ve y cambia lo suyo.
alter table public.configuracion enable row level security;
alter table public.obligaciones  enable row level security;
alter table public.registros     enable row level security;
alter table public.pagos         enable row level security;

drop policy if exists "solo el dueño" on public.configuracion;
drop policy if exists "solo el dueño" on public.obligaciones;
drop policy if exists "solo el dueño" on public.registros;
drop policy if exists "solo el dueño" on public.pagos;

create policy "solo el dueño" on public.configuracion for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "solo el dueño" on public.obligaciones for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "solo el dueño" on public.registros for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "solo el dueño" on public.pagos for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Los visitantes sin sesión no pueden tocar nada.
revoke all on public.configuracion, public.obligaciones, public.registros, public.pagos from anon;
grant select, insert, update, delete on public.configuracion, public.obligaciones, public.registros, public.pagos to authenticated;
