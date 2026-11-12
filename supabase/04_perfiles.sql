-- La Alcancía: varios perfiles por usuario ("Mamá", "Yo", ...). Se puede volver a correr: no borra datos.
-- Todo lo que ya existe queda en el perfil 'mama'.

alter table public.configuracion add column if not exists perfil        text not null default 'mama';
alter table public.configuracion add column if not exists perfil_nombre text not null default 'Mamá';
alter table public.configuracion add column if not exists frecuencia    text not null default 'diario';
alter table public.configuracion drop constraint if exists configuracion_frecuencia_check;
alter table public.configuracion add constraint configuracion_frecuencia_check
  check (frecuencia in ('diario', 'semanal', 'quincenal', 'mensual'));

-- Una configuración por usuario y perfil (antes: una por usuario)
alter table public.configuracion drop constraint if exists configuracion_pkey;
alter table public.configuracion add constraint configuracion_pkey primary key (user_id, perfil);

alter table public.obligaciones add column if not exists perfil text not null default 'mama';
alter table public.registros    add column if not exists perfil text not null default 'mama';
alter table public.pagos        add column if not exists perfil text not null default 'mama';
alter table public.metas        add column if not exists perfil text not null default 'mama';

create index if not exists obligaciones_perfil_idx on public.obligaciones (user_id, perfil);
create index if not exists registros_perfil_idx    on public.registros    (user_id, perfil);
create index if not exists pagos_perfil_idx        on public.pagos        (user_id, perfil);
create index if not exists metas_perfil_idx        on public.metas        (user_id, perfil);
