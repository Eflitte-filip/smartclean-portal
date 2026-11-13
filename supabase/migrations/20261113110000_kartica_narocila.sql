-- ═══════════════════════════════════════════════════════════════════════════
--  Kartica za zaposlenega iz portala: zahteva, ki jo izpolni C72
--
--  Portal (Prisotnost) ob novem zaposlenem ali »Dodeli kartico« ustvari zahtevo.
--  C72, na katerem je prijavljen skrbnik, jo vidi v živo in sam odpre okno
--  »prisloni kartico« za to osebo. Ko je kartica vpisana, funkcija »kartica«
--  zahtevo označi kot opravljeno (portal to vidi in okno zapre).
--  Zahteva velja 15 minut; portal jo lahko prekliče.
--  Varno za ponoven zagon.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.kartica_narocila (
  id          uuid primary key default gen_random_uuid(),
  emp_id      uuid not null references public.employees(id) on delete cascade,
  ime         text not null,
  ustvaril    uuid default auth.uid(),
  ustvarjeno  timestamptz not null default now(),
  velja_do    timestamptz not null default now() + interval '15 minutes',
  opravljeno  timestamptz,
  preklicano  timestamptz
);

create index if not exists kartica_narocila_odprta
  on public.kartica_narocila (ustvarjeno)
  where opravljeno is null and preklicano is null;

alter table public.kartica_narocila enable row level security;

-- nove tabele v public za prijavljene privzeto nimajo pravic (glej 68_kartice_skrite.sql)
grant select, insert, update on public.kartica_narocila to authenticated;

-- osebje (enako kot employees: staff_all_employees) ustvari, vidi in prekliče zahtevo
drop policy if exists kartica_narocila_osebje on public.kartica_narocila;
create policy kartica_narocila_osebje on public.kartica_narocila
  for all to authenticated
  using (app.is_staff()) with check (app.is_staff());

-- skrbnik v aplikaciji RFID (ista definicija kot rfid_podatki → skrbnik) jih vidi na C72
drop policy if exists kartica_narocila_skrbnik on public.kartica_narocila;
create policy kartica_narocila_skrbnik on public.kartica_narocila
  for select to authenticated
  using (app.je_lastnik() or exists (select 1 from public.profiles where id = auth.uid() and active and super_admin));

-- v živo na C72 in v portalu
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'kartica_narocila') then
    alter publication supabase_realtime add table public.kartica_narocila;
  end if;
end $$;
