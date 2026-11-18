// Test only disposable synthetic bytes in the new 250 MiB private bucket.
// Do not write user content, account rows or public media.
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
const ROOT='https://qpcsruhwqhniprakpoox.supabase.co';
const ENDPOINT='https://qpcsruhwqhniprakpoox.storage.supabase.co/storage/v1/upload/resumable';
const BUCKET='traydaq-creator-large-video-private';
const CHUNK=6*1024*1024;
const size=250*1024*1024;
const token=process.env.SUPABASE_SECRET_KEY||'';
if(!token.startsWith('sb_secret_'))throw Error('Expected masked server-only credential. No storage changes.');
const {createClient}=createRequire(resolve('private-src/package.json'))('@supabase/supabase-js');
const db=createClient(ROOT,token,{auth:{autoRefreshToken:false,persistSession:false}});
const filename='synthetic-'+randomUUID()+'.mp4',path='__tus_fixture__/'+randomUUID()+'/'+filename;
const buffer=Buffer.alloc(CHUNK,0);
const status={bucketPrivate:false,uploadSessionSigned:false,bytesUploaded:0,expectedBytes:size,
 fullyStored:false,exactlyRemoved:false,rowsModified:false,existingMediaTouched:false};
let failure='';
const enc=(s)=>Buffer.from(s).toString('base64');
const metadata={bucketName:BUCKET,objectName:path,contentType:'video/mp4',cacheControl:'0'};
const tag=Object.entries(metadata).map(([k,v])=>k+' '+enc(v)).join(',');
try{
 const bucket=await db.storage.getBucket(BUCKET);
 if(bucket.error||bucket.data?.public!==false||bucket.data?.file_size_limit!==size)
  throw Error('250 MiB private bucket not configured');
 status.bucketPrivate=true;
 const signed=await db.storage.from(BUCKET).createSignedUploadUrl(path,{upsert:false});
 if(signed.error||!signed.data?.token)throw Error('TUS upload ticket could not be signed');
 status.uploadSessionSigned=true;
 const headers={'Tus-Resumable':'1.0.0','x-signature':signed.data.token};
 const first=await fetch(ENDPOINT,{
  method:'POST',headers:{...headers,'Upload-Length':String(size),'Upload-Metadata':tag},
  signal:AbortSignal.timeout(20000)
 });
 if(!first.ok)throw Error('TUS POST rejected with status '+first.status);
 const uri=new URL(first.headers.get('location')||'',ENDPOINT);
 if(uri.hostname!=='qpcsruhwqhniprakpoox.storage.supabase.co'||!uri.pathname.startsWith('/storage/v1/upload/resumable'))
  throw Error('Unexpected TUS session URL');
 let position=0;
 for(let i=0;position<size;i++){
  const take=Math.min(CHUNK,size-position);
  const chunk=take===CHUNK?buffer:buffer.subarray(0,take);
  const response=await fetch(uri,{method:'PATCH',headers:{
   ...headers,'Upload-Offset':String(position),'Content-Type':'application/offset+octet-stream'
  },body:chunk,signal:AbortSignal.timeout(40000)});
  if(!response.ok)throw Error('TUS PATCH rejected with status '+response.status+' at chunk '+i);
  const next=Number(response.headers.get('Upload-Offset'));
  if(next!==position+take)throw Error('TUS chunk offset mismatch');
  position=next;status.bytesUploaded=position;
 }
 const verified=await db.storage.from(BUCKET).info(path);
 if(verified.error||Number(verified.data?.size)!==size)
  throw Error('Stored object size could not be verified');
 status.fullyStored=true;
}catch(e){failure=e instanceof Error?e.message:'Unknown TUS upload failure';}
finally{
 try{
  const removed=await db.storage.from(BUCKET).remove([path]);
  if(removed.error)throw Error('Exact disposable object cleanup failed');
  const prefix=path.slice(0,path.lastIndexOf('/'));
  const inventory=await db.storage.from(BUCKET).list(prefix,{limit:10});
  if(inventory.error||inventory.data?.some(v=>v.name===filename))
   throw Error('Synthetic TUS file still exists');
  status.exactlyRemoved=true;
 }catch(e){failure+=(failure?'; ':'')+(e instanceof Error?e.message:'Cleanup verification failed');}
}
const passed=!failure&&status.fullyStored&&status.exactlyRemoved;
console.log(JSON.stringify({result:passed?'PASS':'FAIL',checks:status,...(failure?{failedStage:failure}:{}),
 ...(!status.exactlyRemoved?{cleanupFixturePath:path}:{})}));
if(!passed)process.exitCode=1;
