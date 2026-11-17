-- zgodovina kosa: »Ponovno pranje · označeno« (prej »Ponovno pranje · za ponovno pranje«)
create or replace function public.rfid_oznaka(p_kos uuid, p_vrsta text, p_vkljuci boolean)
returns json language plpgsql security definer set search_path to 'public', 'app' as $$
declare k public.rfid_kosi;
begin
  if not app.sme_rfid() then raise exception 'Ta račun nima dostopa do čipov.' using errcode = '42501'; end if;
  if p_vrsta is null or p_vrsta not in ('madez', 'ponovno') then raise exception 'Neznana oznaka.' using errcode = '22023'; end if;
  select * into k from public.rfid_kosi where id = p_kos for update;
  if not found then raise exception 'Kosa ni.' using errcode = 'P0002'; end if;
  if p_vrsta = 'madez' and k.madez is distinct from coalesce(p_vkljuci, false) then
    update public.rfid_kosi set madez = coalesce(p_vkljuci, false), madez_at = case when p_vkljuci then now() end where id = p_kos returning * into k;
    insert into public.rfid_dogodki (kos_id, tip, opis) values (p_kos, 'madez', case when p_vkljuci then 'označen' else 'odstranjen' end);
  elsif p_vrsta = 'ponovno' and k.ponovno is distinct from coalesce(p_vkljuci, false) then
    update public.rfid_kosi set ponovno = coalesce(p_vkljuci, false), ponovno_at = case when p_vkljuci then now() end,
      ponovno_st = ponovno_st + case when p_vkljuci then 1 else 0 end where id = p_kos returning * into k;
    insert into public.rfid_dogodki (kos_id, tip, opis) values (p_kos, 'ponovno', case when p_vkljuci then 'označeno' else 'oprano' end);
  end if;
  return json_build_object('madez', k.madez, 'madez_at', k.madez_at, 'ponovno', k.ponovno, 'ponovno_at', k.ponovno_at, 'ponovno_st', k.ponovno_st);
end $$;
