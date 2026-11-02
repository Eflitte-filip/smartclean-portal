-- ═══════════════════════════════════════════════════════════════════════════
--  Manjkajoče številke spremnih listov
--
--  Portal na Domovu opozori, če med najnižjo in najvišjo številko v letu
--  kakšne številke ni. Osebje pri vsaki doda list ali jo označi z »Ni lista«,
--  da ne opozarja več (npr. številka je bila pomotoma preskočena).
--
--  Za manjkajočo ne štejeta:
--  - izbrisan list (je v koših in ima sled),
--  - veljavna rezervacija (tablica list pravkar pošilja, 70_rezervacija_stevilk).
--
--  Dostop le prek spodnjih funkcij in le za osebje. Varno za ponoven zagon.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.stevilke_brez_lista (
  doc_year integer not null,
  doc_seq integer not null,
  oznacil text,
  user_id uuid,
  ustvarjeno timestamptz not null default now(),
  primary key (doc_year, doc_seq)
);
alter table public.stevilke_brez_lista enable row level security;
revoke all on public.stevilke_brez_lista from public, anon, authenticated;

-- Letošnje in lanske številke brez lista: še nerešene (brez_lista = false) in označene z »Ni lista« (true).
create or replace function public.app_stevilke_pregled()
returns table (leto integer, stevilka integer, brez_lista boolean, oznacil text, oznaceno timestamptz, prej_datum date)
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  with meje as (
    select n.doc_year, min(n.doc_seq) as od, max(n.doc_seq) as dok
    from public.delivery_notes n
    where n.doc_seq is not null
      and n.doc_year >= extract(year from current_date)::integer - 1
    group by n.doc_year
  ), vse as (
    select m.doc_year, s::integer as doc_seq
    from meje m, generate_series(m.od, m.dok) s
  )
  select v.doc_year, v.doc_seq, b.doc_seq is not null, b.oznacil, b.ustvarjeno,
    (select p.doc_date from public.delivery_notes p
      where p.doc_year = v.doc_year and p.doc_seq < v.doc_seq and p.deleted_at is null
      order by p.doc_seq desc limit 1)
  from vse v
  left join public.stevilke_brez_lista b on b.doc_year = v.doc_year and b.doc_seq = v.doc_seq
  where app.is_staff()
    and not exists (select 1 from public.delivery_notes n where n.doc_year = v.doc_year and n.doc_seq = v.doc_seq)
    and not exists (select 1 from public.stevilke_rezervacije r where r.doc_year = v.doc_year and r.doc_seq = v.doc_seq and r.potece >= now())
  order by v.doc_year desc, v.doc_seq
  limit 1000;
$$;
revoke all on function public.app_stevilke_pregled() from public, anon;
grant execute on function public.app_stevilke_pregled() to authenticated;

-- Označi številko z »Ni lista« (p_brez = true) ali jo vrne med manjkajoče (false).
-- Vrne false, če list s to številko medtem obstaja.
create or replace function public.app_stevilka_brez_lista(p_leto integer, p_stevilka integer, p_brez boolean default true)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
begin
  if not app.is_staff() then
    raise exception 'ni dovoljeno' using errcode = '42501';
  end if;
  if p_brez is not true then
    delete from public.stevilke_brez_lista where doc_year = p_leto and doc_seq = p_stevilka;
    return true;
  end if;
  if exists (select 1 from public.delivery_notes where doc_year = p_leto and doc_seq = p_stevilka) then
    return false;
  end if;
  insert into public.stevilke_brez_lista (doc_year, doc_seq, oznacil, user_id)
  values (p_leto, p_stevilka, (select full_name from public.profiles where id = auth.uid()), auth.uid())
  on conflict do nothing;
  return true;
end $$;
revoke all on function public.app_stevilka_brez_lista(integer, integer, boolean) from public, anon;
grant execute on function public.app_stevilka_brez_lista(integer, integer, boolean) to authenticated;
