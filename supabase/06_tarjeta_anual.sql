-- La Alcancía: cuentas que se pagan con la tarjeta de crédito y pagos anuales.
alter table public.obligaciones add column if not exists con_tarjeta boolean not null default false;
alter table public.obligaciones drop constraint if exists obligaciones_tipo_check;
alter table public.obligaciones add constraint obligaciones_tipo_check check (tipo in ('mensual', 'semanal', 'unica', 'anual'));
