-- La Alcancía: cajitas del banco (p. ej. Nu). Se puede volver a correr: no borra datos.
alter table public.obligaciones  add column if not exists bolsillo text not null default '';
alter table public.metas         add column if not exists bolsillo text not null default '';
alter table public.configuracion add column if not exists banco    text not null default 'Nu';
