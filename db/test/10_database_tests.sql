-- TEST ONLY. Run after 00, 01, migration 001 and migration 002.
-- Every block raises an exception (and psql stops) if a rule is broken.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- ---------------------------------------------------------------------
-- A. The public (anon) key cannot read or change private records
-- ---------------------------------------------------------------------
set role anon;
do $$
declare n int; t text;
begin
  foreach t in array array['orders','accounts','payments','school_events','event_sessions','admin_users',
                           'admin_sessions','audit_log','rate_limit_events','event_access_attempts'] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      raise exception 'anon could read %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;

  begin
    insert into public.orders(name, phone, total) values ('x','1',1);
    raise exception 'anon could insert an order';
  exception when insufficient_privilege then null; end;

  begin
    update public.orders set total = 0;
    raise exception 'anon could update orders';
  exception when insufficient_privilege then null; end;

  begin
    delete from public.accounts;
    raise exception 'anon could delete accounts';
  exception when insufficient_privilege then null; end;

  begin
    perform public.record_order_payment('x','payment','cash',1,now(),null,null,'anon',null);
    raise exception 'anon could call record_order_payment';
  exception when insufficient_privilege then null; end;

  begin
    insert into public.settings(key, value) values ('orders_open','false');
    raise exception 'anon could change settings';
  exception when insufficient_privilege then null; end;

  select count(*) into n from public.settings;
  assert n > 0, 'anon should read settings';

  select count(*) into n from public.reviews;
  assert n = 1, 'anon should only see approved reviews, saw ' || n;

  insert into public.reviews(name, rating, comment, approved) values ('C', 4, 'nice', false);
  begin
    insert into public.reviews(name, rating, comment, approved) values ('D', 5, 'self-approved', true);
    raise exception 'anon could insert an approved review';
  exception when insufficient_privilege then null; end;
  raise notice 'A passed: anon key locked down';
end $$;
reset role;

-- ---------------------------------------------------------------------
-- B. Payments: bank transfer stays unverified until recorded; cash is not
--    received until recorded; idempotent; refunds bounded; ledger immutable
-- ---------------------------------------------------------------------
set role service_role;
do $$
declare oid_bank text; oid_cash text; r jsonb; n int; st text; paid numeric;
begin
  insert into public.orders(name, phone, total, status, payment_method, payment_status, fulfilment_type)
  values ('Bank Buyer','868-300-0000',200,'new','bank_transfer','awaiting_bank_transfer_verification','pickup')
  returning id::text into oid_bank;
  insert into public.orders(name, phone, total, status, payment_method, payment_status, fulfilment_type)
  values ('Cash Buyer','868-300-0001',150,'new','cash_on_delivery','pending_payment','pickup')
  returning id::text into oid_cash;

  select payment_status, coalesce(amount_paid,0) into st, paid from public.orders where id::text = oid_bank;
  assert st = 'awaiting_bank_transfer_verification' and paid = 0, 'bank order should await verification';

  -- moving the order along does not mark it paid
  perform public.set_order_status(oid_bank, 'confirmed', 'tester', null);
  perform public.set_order_status(oid_cash, 'completed', 'tester', null);
  select payment_status into st from public.orders where id::text = oid_bank;
  assert st = 'awaiting_bank_transfer_verification', 'status change must not change payment status (bank), got ' || st;
  select payment_status, coalesce(amount_paid,0) into st, paid from public.orders where id::text = oid_cash;
  assert st = 'pending_payment' and paid = 0, 'completed cash order must still be unpaid, got ' || st;

  r := public.record_order_payment(oid_bank,'payment','bank_transfer',100,now(),'REF1','first half','tester','idem-1');
  assert r->>'payment_status' = 'partially_paid', 'expected partially_paid, got ' || (r->>'payment_status');
  r := public.record_order_payment(oid_bank,'payment','bank_transfer',100,now(),'REF1','first half','tester','idem-1');
  assert (r->>'duplicate')::boolean, 'retry with the same key must not duplicate';
  select count(*) into n from public.payments where order_id::text = oid_bank;
  assert n = 1, 'expected 1 payment row after retry, got ' || n;

  r := public.record_order_payment(oid_bank,'payment','bank_transfer',100,now(),'REF2',null,'tester','idem-2');
  assert r->>'payment_status' = 'paid', 'expected paid';

  begin
    perform public.record_order_payment(oid_bank,'refund','bank_transfer',250,now(),null,null,'tester','idem-3');
    raise exception 'refund above amount paid was allowed';
  exception when raise_exception then
    if sqlerrm <> 'REFUND_EXCEEDS_PAID' then raise; end if;
  end;
  r := public.record_order_payment(oid_bank,'refund','bank_transfer',200,now(),null,'customer cancelled','tester','idem-4');
  assert r->>'payment_status' = 'refunded', 'expected refunded';

  r := public.record_order_payment(oid_cash,'payment','cash',150,now(),null,null,'tester','idem-5');
  assert r->>'payment_status' = 'paid', 'cash should be paid after Record Cash Received';

  begin
    update public.payments set amount = 1;
    raise exception 'payments were editable';
  exception when raise_exception then
    if sqlerrm not like 'Payments cannot be edited%' then raise; end if;
  end;

  select count(*) into n from public.audit_log where entity_id = oid_bank and action like 'order.%_recorded';
  assert n = 3, 'expected 3 audit entries for bank order payments, got ' || n;
  raise notice 'B passed: payment ledger';
end $$;

-- ---------------------------------------------------------------------
-- C. School-event rules
-- ---------------------------------------------------------------------
do $$
declare ev uuid; past_ev uuid; oid text; n int; copy_id uuid; c record;
begin
  select id into ev from public.school_events where slug = 'arthur-lok-jack-oct-15-2026';
  assert ev is not null, 'seed event missing';
  assert (select access_code_hash is null from public.school_events where id = ev), 'seed must have no access code';
  assert (select order_cutoff_at = '2026-10-15T13:30:00Z'::timestamptz from public.school_events where id = ev), 'cutoff must be 09:30 Trinidad';
  assert (select collection_start_at = '2026-10-15T16:00:00Z'::timestamptz and collection_end_at = '2026-10-15T18:00:00Z'::timestamptz
          from public.school_events where id = ev), 'collection window must be 12-2 PM Trinidad';

  -- event order before cutoff: fulfilment fields forced by the database
  insert into public.orders(name, phone, total, status, school_event_id, address, delivery_fee, payment_method,
                            payment_status, items, subtotal, service_fee, programme_or_cohort)
  values ('Student One','868-300-0002',130,'new',ev,'should be removed',30,'cash_on_collection','pending_payment',
          '[{"itemId":"solo_shrimp"}]',130,0,'MBA 2026')
  returning id::text into oid;
  select * into c from public.orders where id::text = oid;
  assert c.fulfilment_type = 'school_event_collection' and c.fulfillment = 'school_event_collection', 'fulfilment type not forced';
  assert c.scheduled_fulfilment_date = '2026-10-15', 'scheduled date not forced';
  assert c.address is null and c.delivery_fee = 0, 'address/delivery fee not cleared';
  assert c.order_number like 'CB-%', 'order number missing';

  -- snapshot is locked
  begin
    update public.orders set total = 1 where id::text = oid;
    raise exception 'event order total was editable';
  exception when raise_exception then
    if sqlerrm not like 'School-event order items and totals are locked%' then raise; end if;
  end;

  -- status flow: collected records who/when; undo needs a reason
  perform public.set_order_status(oid, 'completed', 'staff@clubboils', null);
  select * into c from public.orders where id::text = oid;
  assert c.collected_at is not null and c.collected_by = 'staff@clubboils', 'collection not recorded';
  assert c.payment_status = 'pending_payment', 'collected must not mean paid';
  begin
    perform public.set_order_status(oid, 'ready', 'staff@clubboils', null);
    raise exception 'undo without reason was allowed';
  exception when raise_exception then
    if sqlerrm <> 'CORRECTION_REASON_REQUIRED' then raise; end if;
  end;
  perform public.set_order_status(oid, 'ready', 'staff@clubboils', 'handed to wrong student');
  select * into c from public.orders where id::text = oid;
  assert c.collected_at is null and c.status = 'ready', 'correction did not clear collection';
  select count(*) into n from public.audit_log where entity_id = oid and action = 'order.status_corrected';
  assert n = 1, 'correction not audited';

  -- cancelling with nothing paid
  perform public.set_order_status(oid, 'cancelled', 'staff@clubboils', null);
  assert (select payment_status from public.orders where id::text = oid) = 'failed_or_cancelled', 'cancel should mark payment failed/cancelled';

  -- closed event and past cutoff both refuse new orders
  update public.school_events set status = 'closed' where id = ev;
  begin
    insert into public.orders(name, phone, total, school_event_id) values ('Late','1',1,ev);
    raise exception 'closed event accepted an order';
  exception when raise_exception then
    if sqlerrm <> 'SCHOOL_EVENT_CLOSED' then raise; end if;
  end;
  update public.school_events set status = 'open' where id = ev;

  insert into public.school_events(slug, school_name, event_date, order_cutoff_at, collection_start_at, collection_end_at,
                                   status, policy_version, policy_text)
  values ('past-event','Past School','2026-01-01','2026-01-01T09:30:00-04:00','2026-01-01T12:00:00-04:00',
          '2026-01-01T14:00:00-04:00','open','v1','text')
  returning id into past_ev;
  begin
    insert into public.orders(name, phone, total, school_event_id) values ('Late','1',1,past_ev);
    raise exception 'past-cutoff event accepted an order';
  exception when raise_exception then
    if sqlerrm <> 'SCHOOL_EVENT_CUTOFF_PASSED' then raise; end if;
  end;

  -- duplicate: new draft, no code, no orders, no sessions
  update public.school_events set access_code_hash = 'scrypt$dummy' where id = ev;
  insert into public.event_sessions(event_id, code_version, expires_at) values (ev, 1, now() + interval '1 hour');
  copy_id := public.duplicate_school_event(ev, 'tester');
  select * into c from public.school_events where id = copy_id;
  assert c.status = 'draft' and c.access_code_hash is null, 'duplicate must be a draft with no code';
  assert (select count(*) from public.orders where school_event_id = copy_id) = 0, 'duplicate copied orders';
  assert (select count(*) from public.event_sessions where event_id = copy_id) = 0, 'duplicate copied sessions';
  update public.school_events set access_code_hash = null where id = ev;
  delete from public.event_sessions where event_id = ev;
  raise notice 'C passed: school-event rules';
end $$;

-- ---------------------------------------------------------------------
-- D. Old-style order insert (what the current live site sends) still works
--    after migration 001, and old orders are unchanged.
-- ---------------------------------------------------------------------
do $$
declare c record;
begin
  insert into public.orders(name, phone, email, package, details, fulfillment, address, notes, total, status)
  values ('Old Code','868-1','x@y.z','1x Wings Boil', array['1x Wings Boil - TT$80'],'pickup',null,'Payment: cash_on_delivery
Day: Friday',80,'new') returning * into c;
  assert c.order_number like 'CB-%', 'legacy insert should still get an order number';
  select * into c from public.orders where name = 'Legacy Customer';
  assert c.total = 130 and c.status = 'completed' and c.payment_status is null, 'legacy order changed';
  raise notice 'D passed: backwards compatible';
end $$;

-- ---------------------------------------------------------------------
-- E. Rate limiting
-- ---------------------------------------------------------------------
do $$
declare i int;
begin
  for i in 1..5 loop
    assert public.rate_limit_allowed('login:test', 5, 900), 'should be allowed before 5 failures';
    perform public.rate_limit_record('login:test');
  end loop;
  assert not public.rate_limit_allowed('login:test', 5, 900), 'should be blocked after 5 failures';
  raise notice 'E passed: rate limiting';
end $$;

-- audit log is append-only
do $$ begin
  begin
    delete from public.audit_log;
    raise exception 'audit log was deletable';
  exception when raise_exception then
    if sqlerrm <> 'audit_log is append-only' then raise; end if;
  end;
  raise notice 'F passed: audit log append-only';
end $$;
reset role;
