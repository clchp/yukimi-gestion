begin;

-- The notification worker must not claim domain/integration events that belong
-- to other consumers. Keep the generic outbox claim function intact and expose
-- a dedicated claim function that only leases DELIVER_NOTIFICATION events.
create or replace function public.claim_notification_outbox_events_v1(
  p_worker text,
  p_limit integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_events jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Solo el worker de notificaciones puede reclamar eventos.' using errcode='42501';
  end if;

  if length(coalesce(btrim(p_worker),'')) < 3 then
    raise exception 'El identificador del worker es obligatorio.' using errcode='22023';
  end if;

  with candidates as (
    select oe.id
    from public.outbox_events oe
    where oe.event_type = 'DELIVER_NOTIFICATION'
      and (
        (oe.status in ('PENDING','FAILED') and oe.available_at <= now())
        or (oe.status = 'PROCESSING' and oe.locked_at < now() - interval '15 minutes')
      )
    order by oe.available_at, oe.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,25),100))
  ), claimed as (
    update public.outbox_events oe
    set
      status='PROCESSING',
      attempts=oe.attempts+1,
      locked_at=now(),
      locked_by=btrim(p_worker),
      last_error=null
    from candidates c
    where oe.id=c.id
    returning
      oe.id,
      oe.event_type,
      oe.aggregate_type,
      oe.aggregate_id,
      oe.payload,
      oe.attempts,
      oe.created_at
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',id,
        'eventType',event_type,
        'aggregateType',aggregate_type,
        'aggregateId',aggregate_id,
        'payload',payload,
        'attempts',attempts,
        'createdAt',created_at
      ) order by created_at
    ),
    '[]'::jsonb
  )
  into v_events
  from claimed;

  return v_events;
end;
$$;

revoke all on function public.claim_notification_outbox_events_v1(text,integer)
from public,anon,authenticated;

grant execute on function public.claim_notification_outbox_events_v1(text,integer)
to service_role;

notify pgrst, 'reload schema';

commit;
