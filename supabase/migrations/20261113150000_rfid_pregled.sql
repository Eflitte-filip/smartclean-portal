-- Perilo (portal, prej »Čipi«): povzetek perila s čipi po strankah za kartice strank.
-- Samo branje. Kdo sme: enako kot ostali klici RFID (app.sme_rfid).
-- »Pogrešan« je enako kot v portalu (rfPogresan): aktiven kos, ki je v pralnici dlje kot p_pralnica_dni
-- ali ga ni nihče skeniral več kot p_neviden_dni. Pragova pošlje portal, da je pravilo na enem mestu.
create or replace function public.rfid_pregled(p_pralnica_dni integer default 3, p_neviden_dni integer default 45)
returns json language plpgsql stable security definer set search_path to 'public', 'app' as $$
begin
  if not app.sme_rfid() then raise exception 'Ta račun nima dostopa do perila s čipi.' using errcode = '42501'; end if;
  return coalesce((
    select json_agg(json_build_object(
      'org', x.org_id, 'aktivnih', x.aktivnih, 'pri_stranki', x.pri_stranki, 'v_pralnici', x.v_pralnici,
      'pogresanih', x.pogresanih, 'izgubljenih', x.izgubljenih, 'odpisanih', x.odpisanih,
      'povp_pranj', x.povp_pranj, 'zadnjic', x.zadnjic))
    from (
      select k.org_id,
        count(*) filter (where k.stanje = 'aktiven') as aktivnih,
        count(*) filter (where k.stanje = 'aktiven' and not p.pog and coalesce(k.zadnji_tip, '') <> 'prevzem') as pri_stranki,
        count(*) filter (where k.stanje = 'aktiven' and not p.pog and k.zadnji_tip = 'prevzem') as v_pralnici,
        count(*) filter (where p.pog) as pogresanih,
        count(*) filter (where k.stanje = 'izgubljen') as izgubljenih,
        count(*) filter (where k.stanje = 'odpisan') as odpisanih,
        round(avg(k.pranj) filter (where k.stanje = 'aktiven')) as povp_pranj,
        max(k.zadnjic) as zadnjic
      from public.rfid_kosi k
      cross join lateral (select (k.stanje = 'aktiven' and k.zadnjic is not null and (
        (k.zadnji_tip = 'prevzem' and k.zadnjic < now() - make_interval(days => greatest(p_pralnica_dni, 1)))
        or k.zadnjic < now() - make_interval(days => greatest(p_neviden_dni, 1)))) as pog) p
      group by k.org_id
    ) x
  ), '[]'::json);
end $$;
revoke all on function public.rfid_pregled(integer, integer) from public, anon;
grant execute on function public.rfid_pregled(integer, integer) to authenticated;
