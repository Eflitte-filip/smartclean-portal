-- ═══════════════════════════════════════════════════════════════════════════
--  Dnevnik sprememb: vpisi iz portala niso nikoli uspeli
--
--  Portal zapisuje razdelek, akcijo, opis in ime, stolpca action in entity iz
--  prvotne sheme pa sta obvezna in nimata privzete vrednosti. Baza je zato
--  zavrnila vsak vpis (23502), portal pa je napako le izpisal v konzolo, zato
--  je bil dnevnik prazen. Varno za ponoven zagon.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.audit_log alter column action drop not null;
alter table public.audit_log alter column entity drop not null;
