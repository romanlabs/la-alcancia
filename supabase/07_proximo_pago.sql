-- La Alcancía: próxima fecha de sueldo para perfiles que no reciben a diario.
alter table public.configuracion add column if not exists proximo_pago date;
