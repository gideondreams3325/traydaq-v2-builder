// One disposable signed-TUS Storage transfer. NEVER touches user originals.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const PROJECT='qpcsruhwqhniprakpoox';
const ROOT='https://'+PROJECT+'.supabase.co';
const TUS='https://'+PROJECT+'.storage.supabase.co/storage/v1/upload/resumable';
const BUCKET='traydaq-creator-video-chunks';
const secret=process.env.SUPABASE_SECRET_KEY||'';
if(!secret.startsWith('sb_secret_'))throw Error('A masked Supabase project secret is required for synthetic transfer');
const {createClient}=createRequire(resolve('private-src/package.json'))('@supabase/supabase-js');
const db=createClient(ROOT,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const path='__traydaq_chunk_fixture__/'+randomUUID()+'/chunk-000.bin';
const bytes=6*1024*1024;
const blob=new Blob([new Uint8Array(bytes).fill(123)],{type:'application/octet-stream'});
const sha=b=>createHash('sha256').update(b).digest('hex');
const status={privateBucket:false,signed:false,tusCreated:false,head0:false,chunkUploaded:false,
 finalOffset:false,readbackVerified:false,anonymousDenied:false,cleaned:false,noUserDataTouched:true};
let failure='';
try{
 const found=await db.storage.getBucket(BUCKET);
 if(found.error||found.data?.public!==false||Number(found.data.file_size_limit)!==bytes)
  throw Error('Private 6 MiB chunk bucket is not configured correctly');
 status.privateBucket=true;
 const ticket=await db.storage.from(BUCKET).createSignedUploadUrl(path,{upsert:false});
 if(ticket.error||!ticket.data?.token)throw Error('Signed private chunk authorization failed');
 status.signed=true;
 const meta={bucketName:BUCKET,objectName:path,contentType:'application/octet-stream',cacheControl:'0'};
 const encoded=Object.entries(meta).map(([k,v])=>k+' '+Buffer.from(v,'utf8').toString('base64')).join(',');
 const token=String(ticket.data.token);
 status.tokenShape=token.split('.').length===3?'three-segment-JWS':'non-JWS-'+token.split('.').length;
 status.tokenBytes=token.length;
 let res=null,activeTus='',failures=[];
 for(const endpoint of [TUS,ROOT+'/storage/v1/upload/resumable']){
  const attempt=await fetch(endpoint,{method:'POST',redirect:'error',
   headers:{'Tus-Resumable':'1.0.0','x-signature':token,
    'Upload-Length':String(bytes),'Upload-Metadata':encoded},
   signal:AbortSignal.timeout(25000)});
  if(attempt.status===201){res=attempt;activeTus=endpoint;break;}
  const body=await attempt.text().catch(()=>'');
  failures.push(attempt.status+':'+body.slice(0,180).replace(/[^A-Za-z0-9 _.,:{}"'-]/g,''));
 }
 if(!res)throw Error('Both supported signed TUS hosts failed ('+failures.join('; ')+')');
 const loc=res.headers.get('location')||'';
 if(!loc)throw Error('No signed TUS upload URL');
 const url=new URL(loc,activeTus);
 if(url.origin!==new URL(activeTus).origin||!url.pathname.startsWith('/storage/v1/upload/resumable/'))
  throw Error('Unexpected TUS upload URL');
 status.tusCreated=true;
 const head=async()=>{
  const r=await fetch(url,{method:'HEAD',redirect:'error',
   headers:{'Tus-Resumable':'1.0.0','x-signature':ticket.data.token},
   signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw Error('Signed HEAD failed with '+r.status);
  return Number(r.headers.get('Upload-Offset'));
 };
 status.head0=(await head())===0;
 if(!status.head0)throw Error('Expected initial TUS offset zero');
 const patch=await fetch(url,{method:'PATCH',redirect:'error',
  headers:{'Tus-Resumable':'1.0.0','x-signature':ticket.data.token,
   'Upload-Offset':'0','Content-Type':'application/offset+octet-stream'},
  body:blob,signal:AbortSignal.timeout(180000)});
 if(patch.status!==204)throw Error('Signed 6 MiB TUS PATCH returned '+patch.status);
 status.chunkUploaded=true;
 status.finalOffset=(await head())===bytes;
 if(!status.finalOffset)throw Error('TUS did not acknowledge all 6 MiB');
 const saved=await db.storage.from(BUCKET).download(path);
 if(saved.error||!saved.data)throw Error('Private chunk was not saved');
 const read=Buffer.from(await saved.data.arrayBuffer());
 status.readbackVerified=read.length===bytes&&sha(read)===sha(Buffer.from(await blob.arrayBuffer()));
 if(!status.readbackVerified)throw Error('Private TUS bytes mismatch');
 const unauth=await fetch(ROOT+'/storage/v1/object/public/'+BUCKET+'/'+path,{
  method:'GET',redirect:'error',signal:AbortSignal.timeout(15000)});
 status.anonymousDenied=[400,401,403,404].includes(unauth.status);
 if(!status.anonymousDenied)throw Error('Private chunk was readable without authentication');
}catch(e){failure=e instanceof Error?e.message:'Unexpected failure';}
finally{
 try{
  const deleted=await db.storage.from(BUCKET).remove([path]);
  if(deleted.error)throw Error('Cannot remove synthetic chunk');
  const folder=path.split('/').slice(0,2).join('/');
  const listed=await db.storage.from(BUCKET).list(folder,{limit:10});
  status.cleaned=!listed.error&&!listed.data?.some(x=>x.name==='chunk-000.bin');
 }catch{failure+=(failure?'; ':'')+'Synthetic chunk cleanup unverified';}
}
const pass=Object.entries(status).every(([name,value])=>typeof value==='boolean'?value:true)&&!failure;
console.log(JSON.stringify({result:pass?'PASS':'FAIL',status,...(failure?{failure}:{})}));
if(!pass)process.exitCode=1;
