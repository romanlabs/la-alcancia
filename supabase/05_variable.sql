-- La Alcancía: cuentas cuyo valor cambia cada mes (recibos por consumo, cobros en dólares).
alter table public.obligaciones add column if not exists variable boolean not null default false;
