import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import postgres from 'postgres';

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const sql = postgres(databaseUrl, {
  max: 6,
  connect_timeout: 10,
  idle_timeout: 5,
  onnotice: () => undefined,
});

const adminId = randomUUID();
const idempotencyKey = `concurrency-create-client-${randomUUID()}`;
const marker = `Cliente concurrente ${randomUUID()}`;
let clientId;

async function asAdmin(operation) {
  return sql.begin(async (transaction) => {
    await transaction`select set_config('app.user_id', ${adminId}, true)`;
    await transaction.unsafe('set local role authenticated');
    return operation(transaction);
  });
}

try {
  await sql.begin(async (transaction) => {
    await transaction`
      insert into auth.users(
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
      )
      values (
        ${adminId},
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        ${`concurrency-${adminId}@yukimi.test`},
        '',
        now(),
        '{}'::jsonb,
        ${JSON.stringify({ display_name: 'Concurrency Admin' })}::jsonb,
        now(),
        now()
      )
    `;
    await transaction`
      update public.profiles
      set is_active = true
      where id = ${adminId}
    `;
    await transaction`
      insert into public.user_roles(user_id, role_code, granted_by)
      values (${adminId}, 'ADMIN', ${adminId})
    `;
  });

  const input = JSON.stringify({ fullName: marker });
  const createClient = () =>
    asAdmin(async (transaction) => {
      const [row] = await transaction`
        select public.create_client_v1(
          ${input}::jsonb,
          ${idempotencyKey}
        ) as result
      `;
      return row.result;
    });

  const [first, second] = await Promise.all([createClient(), createClient()]);
  assert.equal(first.id, second.id, 'La misma clave debe devolver el mismo cliente.');
  clientId = first.id;

  const [{ total }] = await sql`
    select count(*)::integer as total
    from public.clients
    where full_name = ${marker}
  `;
  assert.equal(total, 1, 'Dos solicitudes concurrentes no deben duplicar el cliente.');

  const [{ version }] = await sql`
    select version
    from public.clients
    where id = ${clientId}
  `;

  const updateClient = (fullName) =>
    asAdmin(async (transaction) => {
      const [row] = await transaction`
        select public.update_client_v1(
          ${clientId},
          ${version},
          ${JSON.stringify({ fullName })}::jsonb
        ) as result
      `;
      return row.result;
    });

  const updates = await Promise.allSettled([
    updateClient(`${marker} A`),
    updateClient(`${marker} B`),
  ]);
  const successful = updates.filter((result) => result.status === 'fulfilled');
  const rejected = updates.filter((result) => result.status === 'rejected');

  assert.equal(successful.length, 1, 'Solo una actualización concurrente debe ganar.');
  assert.equal(rejected.length, 1, 'Una actualización concurrente debe ser rechazada.');
  assert.equal(
    rejected[0]?.reason?.code,
    '40001',
    'La actualización obsoleta debe devolver SQLSTATE 40001.',
  );

  console.log(
    'Concurrencia correcta: creación idempotente única y una sola actualización ganadora.',
  );
} finally {
  try {
    await sql.begin(async (transaction) => {
      if (clientId) {
        await transaction`delete from public.clients where id = ${clientId}`;
      }
      await transaction`
        delete from public.idempotency_keys
        where scope = 'CREATE_CLIENT'
          and idempotency_key = ${idempotencyKey}
      `;
      await transaction`delete from auth.users where id = ${adminId}`;
      await transaction`
        delete from public.audit_log
        where entity_id in (${clientId ?? ''}, ${adminId})
      `;
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
