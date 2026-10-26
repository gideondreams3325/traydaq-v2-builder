// Disposable, provider-backed proof of the *existing* private case-evidence bucket.
// No case registry, customer identity, Firebase account, grant or custody mutation.
// Runs ONLY in trusted main GitHub Actions with a masked Supabase secret.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const PROJECT = 'qpcsruhwqhniprakpoox';
const ROOT = 'https://' + PROJECT + '.supabase.co';
const BUCKET = 'traydaq-confidential-case-evidence';
const key = process.env.SUPABASE_SECRET_KEY || '';
if (!key.startsWith('sb_secret_')) {
  throw Error('Configured SUPABASE_SECRET_KEY is not a Supabase secret key; refused to write');
}
const {createClient} = createRequire(resolve('private-src/package.json'))('@supabase/supabase-js');
const client = createClient(ROOT, key, {auth:{autoRefreshToken:false,persistSession:false}});
const store = client.storage.from(BUCKET);

// Same 1x1 synthetic PNG as the earlier disposable Storage proof; no personal data.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/RqsAAAAASUVORK5CYII=',
  'base64'
);
const hash = data => createHash('sha256').update(data).digest('hex');
const caseId = randomUUID();
const evidenceId = randomUUID();
const fileName = randomUUID() + '.png';
const folder = caseId + '/' + evidenceId;
const path = folder + '/' + fileName;

let attempted = false;
let uploaded = false;
let readbackMatched = false;
let anonymousBlocked = false;
let cleaned = false;
let failure = '';

async function absent() {
  const {data,error} = await store.list(folder,{limit:20});
  if (error || !Array.isArray(data)) throw Error('Private test folder inventory unavailable');
  return !data.some(item => item.name === fileName);
}

try {
  // Preflight: service-role-only RPC must be available, but no real staff can match this UID.
  const who = await client.rpc('v2_case_staff_verified',{
    p_uid:'nonexistentCiProbe2026',
    p_email:'nobody@example.invalid',
    p_require_owner:false
  });
  if (who.error || who.data !== false) throw Error('Privileged RPC credential check failed');
  const {data:bucket,error:bucketError} = await client.storage.getBucket(BUCKET);
  if (bucketError || !bucket || bucket.public !== false ||
      bucket.id !== BUCKET) throw Error('Evidence bucket is unavailable or not private');
  if (!await absent()) throw Error('Refused to overwrite an existing object');

  attempted = true;
  const upload = await store.upload(path,new Blob([png],{type:'image/png'}),{
    contentType:'image/png',upsert:false,cacheControl:'0'
  });
  if (upload.error) throw Error('Synthetic confidential-bucket upload failed');
  uploaded = true;

  const retrieved = await store.download(path);
  if (retrieved.error || !retrieved.data) throw Error('Private download failed');
  const readback = Buffer.from(await retrieved.data.arrayBuffer());
  assert.equal(readback.length,png.length,'Downloaded length mismatch');
  assert.equal(hash(readback),hash(png),'Downloaded SHA256 mismatch');
  assert.deepEqual(readback,png,'Downloaded bytes mismatch');
  readbackMatched = true;

  // No auth header and no key. Public-object path must be inaccessible.
  const publicResponse = await fetch(ROOT+'/storage/v1/object/public/'+BUCKET+'/'+path,{
    method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000)
  });
  if (![400,401,403,404].includes(publicResponse.status)) {
    throw Error('Anonymous public-object request not verifiably denied');
  }
  anonymousBlocked = true;
} catch (e) {
  failure = e instanceof Error ? e.message : 'Unexpected synthetic test failure';
} finally {
  // Never select other files or accounts. Only remove this exact random object.
  if (attempted) {
    try {
      const result = await store.remove([path]);
      if (result.error) throw Error('Synthetic object removal failed');
      cleaned = await absent();
      if (!cleaned) throw Error('Synthetic object remains after cleanup');
    } catch {
      failure = (failure ? failure+'; ' : '')+'Cleanup verification failed';
    }
  }
}

const passed = !failure && uploaded && readbackMatched && anonymousBlocked && cleaned;
console.log(JSON.stringify({
  result:passed?'PASS':'FAIL',
  bucketPrivate:true,
  disposablePngUploaded:uploaded,
  readbackBytesSha256Verified:readbackMatched,
  publicAccessDenied:anonymousBlocked,
  disposableFileRemoved:cleaned,
  existingAccountsSelected:false,
  caseRegistryModified:false,
  ...(failure?{failedStage:failure}:{}),
  ...(!cleaned && attempted?{cleanupFixturePath:path}:{})
}));
if (!passed) process.exitCode=1;
