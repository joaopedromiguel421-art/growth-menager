begin;
select plan(2);

select throws_ok(
  $$select app.queue_read('untrusted', 120, 10)$$,
  '22023',
  'Unsupported Growth Manager queue',
  'unknown queues are rejected'
);

select throws_ok(
  $$select app.queue_read('general', 1, 10)$$,
  '22023',
  'Invalid queue read bounds',
  'unsafe visibility timeout is rejected'
);

select * from finish();
rollback;
