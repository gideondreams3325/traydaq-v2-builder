import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const BUCKET='traydaq-creator-video-chunks';
const root='https://qpcsruhwqhniprakpoox.supabase.co';
const key=process.env.SUPABASE_SECRET_KEY||'';
if(!key.startsWith('sb_secret_'))throw Error('Requires the protected Builder Supabase secret');
const {createClient}=createRequire(resolve('private-src/package.json'))('@supabase/supabase-js');
const db=createClient(root,key,{auth:{autoRefreshToken:false,persistSession:false}});
const uid='__traydaq_chunk_fixture__',id=randomUUID(),folder=uid+'/'+id;
const path=folder+'/chunk-000.bin',size=6*1024*1024;
const bytes=Buffer.alloc(size,113);
const sha=x=>createHash('sha256').update(x).digest('hex');
const state={bucketPrivate:false,uploaded:false,fullSizeVerified:false,hashVerified:false,
 anonymousDenied:false,cleaned:false,realAccountsAccessed:false,publicContentModified:false};
let failure='';
try{
 const bucket=await db.storage.getBucket(BUCKET);
 if(bucket.error||bucket.data?.public!==false||Number(bucket.data.file_size_limit)!==size)
  throw Error('Private binary chunk bucket was not configured');
 state.bucketPrivate=true;
 const prior=await db.storage.from(BUCKET).list(folder,{limit:10});
 if(prior.error||prior.data?.some(x=>x.name==='chunk-000.bin'))
  throw Error('Synthetic prefix is unavailable');
 const saved=await db.storage.from(BUCKET).upload(path,bytes,{
  contentType:'application/octet-stream',upsert:false,cacheControl:'0'
 });
 if(saved.error)throw Error('6 MiB private chunk upload failed: '+String(saved.error.message).slice(0,100));
 state.uploaded=true;
 const info=await db.storage.from(BUCKET).info(path);
 state.fullSizeVerified=!info.error&&Number(info.data?.size)===size;
 if(!state.fullSizeVerified)throw Error('Private binary chunk size mismatch');
 const downloaded=await db.storage.from(BUCKET).download(path);
 if(downloaded.error||!downloaded.data)throw Error('Private binary chunk readback failed');
 const result=Buffer.from(await downloaded.data.arrayBuffer());
 state.hashVerified=result.length===size&&sha(result)===sha(bytes);
 if(!state.hashVerified)throw Error('Private binary chunk checksum mismatch');
 const publicRead=await fetch(root+'/storage/v1/object/public/'+BUCKET+'/'+path,{
  method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000)
 });
 state.anonymousDenied=[400,401,403,404].includes(publicRead.status);
 if(!state.anonymousDenied)throw Error('Private video chunk became publicly accessible');
}catch(e){failure=e instanceof Error?e.message:'Synthetic check failed';}
finally{
 try{
  const deleted=await db.storage.from(BUCKET).remove([path]);
  if(deleted.error)throw Error('Cleanup failed');
  const listed=await db.storage.from(BUCKET).list(folder,{limit:10});
  state.cleaned=!listed.error&&!listed.data?.some(x=>x.name==='chunk-000.bin');
 }catch{failure+=(failure?'; ':'')+'Synthetic cleanup unavailable';}
}
const pass=state.bucketPrivate&&state.uploaded&&state.fullSizeVerified&&
 state.hashVerified&&state.anonymousDenied&&state.cleaned&&!failure;
console.log(JSON.stringify({result:pass?'PASS':'FAIL',state,...(failure?{failure}:{})}));
if(!pass)process.exitCode=1;
