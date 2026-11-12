-- La Alcancía: sección de ahorro (metas). Se puede volver a correr: no borra datos.

alter table public.configuracion add column if not exists ahorro_pct int not null default 0;
alter table public.configuracion drop constraint if exists configuracion_ahorro_pct_check;
alter table public.configuracion add constraint configuracion_ahorro_pct_check check (ahorro_pct between 0 and 100);

-- Lo que cada día se mandó a cada meta: { "id_meta": monto }
alter table public.registros add column if not exists ahorro jsonb not null default '{}';

-- 'pago' = pago de una cuenta; 'retiro' = plata que se sacó de una meta de ahorro
alter table public.pagos add column if not exists tipo text not null default 'pago';

create table if not exists public.metas (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  nombre       text not null,
  objetivo     numeric,                       -- opcional: a cuánto quiere llegar
  ahorrado     numeric not null default 0,
  porcentaje   int     not null default 50 check (porcentaje between 0 and 100), -- peso dentro del ahorro
  nota         text    not null default '',
  activa       boolean not null default true,
  actualizado  timestamptz not null default now()
);
create index if not exists metas_user_idx on public.metas (user_id);

alter table public.metas enable row level security;
drop policy if exists "solo el dueño" on public.metas;
create policy "solo el dueño" on public.metas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.metas from anon;
grant select, insert, update, delete on public.metas to authenticated;
