-- Rollback for 20261127220000_guard_event_registration_capacity.sql
-- Manual use only after review.
begin;
drop trigger if exists event_registration_insert_guard on public.event_registrations;
drop function if exists public.guard_event_registration_insert();
commit;
