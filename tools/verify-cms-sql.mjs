// Execute the actual migrations and policies in isolated WASM PostgreSQL.
// Auth/Storage service schemas are minimal fixtures; no real Supabase is contacted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '../.cache/cms-db/node_modules/@electric-sql/pglite/dist/index.js';
const db = new PGlite();
const admin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const member = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function role(name, uid = '') {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
  await db.exec(`set role ${name}`);
}
const rows = async (sql, params) => (await db.query(sql, params)).rows;
async function rejected(sql, code = '42501') { await assert.rejects(db.query(sql), error => error.code === code); }
try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;
  `);
  for (let run = 0; run < 2; run++) {
    await db.exec(fs.readFileSync('supabase/001_cms.sql', 'utf8'));
    await db.exec(fs.readFileSync('supabase/002_seed_content.sql', 'utf8'));
    await db.exec(fs.readFileSync('supabase/003_storage_cleanup_guard.sql', 'utf8'));
  }
  assert.equal((await rows('select * from cms_private.admins')).length, 0);
  assert.equal((await rows('select * from cms_teachers')).length, 2);
  assert.equal((await rows('select * from cms_reviews')).length, 0);
  console.log('PASS actual SQL syntax, repeatable migrations/seed, no admin/user creation');
  await db.exec(`insert into auth.users values ('${admin}'), ('${member}'); insert into cms_private.admins(user_id) values ('${admin}');
    insert into cms_teachers(name,description,image_path,is_published) values ('Hidden fixture','Private copy','teachers/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png',false);`);
  await role('anon');
  assert.equal((await rows('select * from cms_teachers')).length, 2);
  assert.equal((await rows('select cms_is_admin() as allowed'))[0].allowed, false);
  await rejected(`insert into cms_teachers(name,description,image_path) values ('X','X','teachers/a.png')`);
  await rejected(`update cms_teachers set name='X'`);
  await rejected(`delete from cms_teachers`);
  await rejected(`select * from cms_private.admins`);
  await rejected(`select * from cms_media`);
  await rejected(`select * from cms_unused_media()`);
  await rejected(`insert into storage.objects(bucket_id,name) values ('cms-images','teachers/a.png')`);
  assert.equal((await rows(`delete from storage.objects returning id`)).length, 0);
  assert.equal((await rows(`update storage.objects set name='teachers/a.png' returning id`)).length, 0);
  console.log('PASS PostgreSQL anon: only published rows, no content/media/admin writes or private reads');
  await role('authenticated', member);
  assert.equal((await rows('select * from cms_teachers')).length, 2);
  assert.equal((await rows('select cms_is_admin() as allowed'))[0].allowed, false);
  await rejected(`insert into cms_teachers(name,description,image_path) values ('X','X','teachers/a.png')`);
  assert.equal((await rows(`update cms_teachers set name='X' returning id`)).length, 0);
  assert.equal((await rows(`delete from cms_teachers returning id`)).length, 0);
  await rejected(`insert into cms_private.admins(user_id) values ('${member}')`);
  await rejected(`insert into storage.objects(bucket_id,name) values ('cms-images','teachers/a.png')`);
  console.log('PASS PostgreSQL authenticated non-admin: no escalation, no content writes or uploads');
  await role('authenticated', admin);
  assert.equal((await rows('select * from cms_teachers')).length, 3);
  assert.equal((await rows('select cms_is_admin() as allowed'))[0].allowed, true);
  const created = (await rows(`insert into cms_reviews(name,location,description,image_path,stars,is_published) values ('Review fixture','Fixture city','Fixture text','reviews/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png',3,true) returning *`))[0];
  const changed = (await rows(`update cms_reviews set stars=1 where id=$1 returning *`, [created.id]))[0];
  assert.equal(changed.stars, 1);
  assert.ok(changed.updated_at >= created.updated_at);
  await rejected(`update cms_reviews set stars=6`, '23514');
  await rejected(`update cms_reviews set location=''`, '23514');
  await rejected(`update cms_teachers set image_path='javascript:alert(1)'`, '23514');
  assert.equal((await rows(`delete from cms_reviews where id=$1 returning id`, [created.id])).length, 1);
  console.log('PASS PostgreSQL admin CRUD, timestamps and field constraints');
  const used = 'teachers/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png';
  const unused = 'teachers/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png';
  const fresh = 'teachers/ffffffff-ffff-4fff-8fff-ffffffffffff.png';
  for (const path of [used,unused,fresh]) {
    await db.query(`insert into cms_media(path) values ($1)`, [path]);
    await db.query(`insert into storage.objects(bucket_id,name) values ('cms-images',$1)`, [path]);
  }
  assert.equal((await rows(`delete from storage.objects where name=$1 returning id`, [used])).length, 0);
  assert.equal((await rows(`delete from storage.objects where name=$1 returning id`, [fresh])).length, 0);
  await db.query(`insert into storage.objects(bucket_id,name) values ('cms-images','teachers/a.png')`);
  assert.equal((await rows(`delete from storage.objects where name='teachers/a.png' returning id`)).length, 0);
  await rejected(`insert into storage.objects(bucket_id,name) values ('cms-images','teachers/../a.png')`);
  await rejected(`insert into storage.objects(bucket_id,name) values ('cms-images','reviews/a.svg')`);
  await db.exec('reset role');
  await db.query(`update cms_media set created_at=now()-interval '2 hours' where path<>$1`, [fresh]);
  await role('authenticated', admin);
  assert.deepEqual((await rows('select * from cms_unused_media()')).map(r => r.path), [unused]);
  assert.equal((await rows(`delete from storage.objects where name=$1 returning id`, [unused])).length, 1);
  assert.equal((await rows(`update storage.objects set name='teachers/a.png' returning id`)).length, 0);
  console.log('PASS PostgreSQL Storage policies: upload allowed only for admin, referenced hidden image protected, unused deletion and grace period');
  await db.exec('reset role'); await db.query(`delete from cms_private.admins where user_id=$1`, [admin]);
  await role('authenticated', admin);
  assert.equal((await rows('select cms_is_admin() as allowed'))[0].allowed, false);
  assert.equal((await rows(`delete from cms_teachers returning id`)).length, 0);
  console.log('PASS revocation blocks existing user immediately');
} finally { await db.close(); }
