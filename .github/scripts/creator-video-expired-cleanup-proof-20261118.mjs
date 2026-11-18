import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const ROOT='https://qpcsruhwqhniprakpoox.supabase.co';
const BUCKET='traydaq-creator-video-chunks';
const TABLE='v2_creator_large_video_uploads';
const secret=process.env.SUPABASE_SECRET_KEY||'';
if(!secret.startsWith('sb_secret_'))throw Error('Missing masked service key for synthetic proof');
const {createClient}=createRequire(resolve('private-src/package.json'))('@supabase/supabase-js');
const db=createClient(ROOT,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const uid='fixture'+randomUUID().replace(/-/g,'').slice(0,23);
const old=new Date(Date.now()-60*60000).toISOString();
const rowA=randomUUID(),rowB=randomUUID();
const exact=Array.from({length:2},(_,i)=>({id:i?rowB:rowA,
 object_path:uid+'/'+(i?rowB:rowA)+'/original.mp4',
 state:i?'processing':'initiated',processing_attempts:i?5:0,
 firebase_uid:uid,original_bytes:18*1024*1024,chunk_count:3,
 expires_at:old,updated_at:old
}));
const part=uid+'/'+rowA+'/chunk-000.bin';
let failure='',ran=false,cleaned=false;
try{
 const inserted=await db.from(TABLE).insert(exact);
 if(inserted.error)throw Error('Synthetic reservation setup rejected');
 const upload=await db.storage.from(BUCKET).upload(part,new Uint8Array(1024),{
  upsert:false,cacheControl:'0',contentType:'application/octet-stream'
 });
 if(upload.error)throw Error('Synthetic private part setup rejected');
 const runner=spawnSync('node',['private-src/.github/scripts/process-large-creator-video.mjs'],{
  encoding:'utf8',timeout:150000,
  env:{...process.env,SUPABASE_SECRET_KEY:secret},
  maxBuffer:512000
 });
 if(runner.error||runner.status!==0)throw Error('Worker exited unsuccessfully');
 ran=true;
 const rows=await db.from(TABLE).select('id').in('id',[rowA,rowB]);
 const info=await db.storage.from(BUCKET).info(part);
 if(rows.error||rows.data?.length||!info.error)
  throw Error('Expired synthetic rows or chunks were not fully cleaned');
 cleaned=true;
}catch(e){failure=e instanceof Error?e.message:'Unknown live cleanup fixture failure';}
finally{
 // Exact synthetic objects/rows only. No searches for users or shared paths.
 const removed=await db.storage.from(BUCKET).remove([part]);
 const dropped=await db.from(TABLE).delete().in('id',[rowA,rowB]);
 if(removed.error||dropped.error)failure+=(failure?'; ':'')+'Synthetic cleanup API failed';
}
console.log(JSON.stringify({result:(!failure&&ran&&cleaned)?'PASS':'FAIL',
 workerCompleted:ran,expiredChunkAndReservationsCleared:cleaned,
 realUserIdsSelected:false,publicMediaChanged:false,
 ...(failure?{failedStage:failure}:{})}));
if(failure||!ran||!cleaned)process.exitCode=1;
