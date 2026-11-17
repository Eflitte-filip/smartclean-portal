-- Stroški obratovanja (Statistika → čisto spodaj): pralna sredstva, voda, elektrika, plin, servis, najemnina, plače, drugo.
-- Znesek je BREZ DDV (primerja se s prometom na kg brez DDV). Količina in enota sta neobvezni (poraba na kg).
-- Gorivo se ne vpisuje tu — Statistika ga vzame iz razdelka Gorivo.
-- Dostop: enako kot Gorivo (lastnik in super admin, app.sme_gorivo).
create table if not exists public.stroski (
  id uuid primary key default gen_random_uuid(),
  datum date not null default current_date,
  vrsta text not null,
  opis text,
  znesek numeric(12,2) not null,
  kolicina numeric(14,3),
  enota text,
  avtor text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz,
  constraint stroski_vrsta check (vrsta in ('sredstva', 'voda', 'elektrika', 'plin', 'servis', 'najemnina', 'place', 'drugo')),
  constraint stroski_enota check (enota is null or enota in ('l', 'kg', 'm3', 'kwh')),
  constraint stroski_znesek check (znesek >= 0),
  constraint stroski_kolicina check (kolicina is null or kolicina >= 0)
);
create index if not exists stroski_datum on public.stroski (datum desc) where deleted_at is null;

alter table public.stroski enable row level security;
drop policy if exists stroski_vodstvo on public.stroski;
create policy stroski_vodstvo on public.stroski for all to authenticated using (app.sme_gorivo()) with check (app.sme_gorivo());
revoke all on public.stroski from anon;
grant select, insert, update, delete on public.stroski to authenticated;
