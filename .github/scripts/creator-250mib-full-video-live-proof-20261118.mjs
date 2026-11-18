// Single disposable 250 MiB MP4: private chunks -> worker -> verified private
// <=15 MiB derivative -> exact-path deletion. No customer identity/media.
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
import {mkdtemp,open,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const ROOT='https://qpcsruhwqhniprakpoox.supabase.co';
const ORIGINAL='traydaq-creator-video-chunks';
const DERIVED='traydaq-native-creator-pending';
const TABLE='v2_creator_large_video_uploads';
const TOTAL=250*1024*1024,CHUNK=6*1024*1024;
const key=process.env.SUPABASE_SECRET_KEY||'';
if(!key.startsWith('sb_secret_'))throw Error('Expected masked Supabase service credential');
const {createClient}=createRequire(resolve('private-src/package.json'))('@supabase/supabase-js');
const db=createClient(ROOT,key,{auth:{autoRefreshToken:false,persistSession:false}});
const uid='fixture'+randomUUID().replace(/-/g,'').slice(0,22),id=randomUUID();
const prefix=uid+'/'+id;
const source=prefix+'/original.mp4',derived=prefix+'/0.mp4';
const path=i=>prefix+'/chunk-'+String(i).padStart(3,'0')+'.bin';
const dir=await mkdtemp(join(tmpdir(),'traydaq-250mb-fixture-'));
const original=join(dir,'fixture.mp4');
const results={bytes:TOTAL,chunksUploaded:0,stagedPrivate:false,workerValidated:false,
 derivedPrivate:false,derivedWithin15MiB:false,sourceChunksCleaned:false,
 exactCleanup:false,realMemberSelected:false,publicBucketModified:false};
let failure='';
const run=(program,args,time=120000)=>{
 const p=spawnSync(program,args,{encoding:'utf8',timeout:time,maxBuffer:1024*1024});
 if(p.error||p.status!==0)throw Error('Synthetic test media generation or transcode failed');
 return p.stdout||'';
};
try{
 // A genuine decodable 179-second faststart MP4 with a valid opaque 'free'
 // atom extends the file to exactly 250 MiB, exercising every transfer byte.
 run('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y','-f','lavfi',
  '-i','color=c=black:size=320x180:rate=2','-t','179','-an','-c:v','libx264',
  '-preset','ultrafast','-pix_fmt','yuv420p','-movflags','+faststart',original]);
 const initial=(await stat(original)).size,padding=TOTAL-initial;
 if(padding<8||padding>=2**32)throw Error('Cannot create valid free atom');
 const file=await open(original,'r+');
 try{
  const atom=Buffer.alloc(8);atom.writeUInt32BE(padding,0);atom.write('free',4,'ascii');
  await file.write(atom,0,atom.length,initial);
  await file.truncate(TOTAL);
 }finally{await file.close();}
 const inspected=Number(run('ffprobe',['-v','error','-show_entries',
  'format=duration','-of','default=noprint_wrappers=1:nokey=1',original]).trim());
 if(!Number.isFinite(inspected)||inspected<175||inspected>180||
   (await stat(original)).size!==TOTAL)
  throw Error('Synthetic original duration or size invalid');
 const inserted=await db.from(TABLE).insert({
  id,firebase_uid:uid,object_path:source,original_bytes:TOTAL,
  mime_type:'video/mp4',chunk_count:Math.ceil(TOTAL/CHUNK),
  state:'uploaded_unverified',expires_at:new Date(Date.now()+86400000).toISOString()
 });
 if(inserted.error)throw Error('Synthetic reservation rejected');
 const f=await open(original,'r');
 try{
  for(let i=0;i<Math.ceil(TOTAL/CHUNK);i++){
   const start=i*CHUNK,bytes=Math.min(CHUNK,TOTAL-start),buf=Buffer.alloc(bytes);
   const got=await f.read(buf,0,bytes,start);
   if(got.bytesRead!==bytes)throw Error('Local synthetic video read incomplete');
   const uploaded=await db.storage.from(ORIGINAL).upload(path(i),buf,{
    upsert:false,contentType:'application/octet-stream',cacheControl:'0'
   });
   if(uploaded.error)throw Error('Private chunk rejected at '+i);
   results.chunksUploaded++;
  }
 }finally{await f.close();}
 results.stagedPrivate=true;
 const worker=spawnSync('node',['private-src/.github/scripts/process-large-creator-video.mjs'],{
  encoding:'utf8',timeout:1200000,maxBuffer:128000,
  env:{...process.env,SUPABASE_SECRET_KEY:key}
 });
 if(worker.error||worker.status!==0)throw Error('Full-size worker did not complete');
 const row=await db.from(TABLE).select('state,derived_path,duration_seconds,chunks_cleaned_at')
  .eq('id',id).single();
 if(row.error||row.data?.state!=='validated'||row.data?.derived_path!==derived||
    Number(row.data.duration_seconds)<175||Number(row.data.duration_seconds)>180)
  throw Error('Worker did not validate original media');
 results.workerValidated=true;
 const info=await db.storage.from(DERIVED).info(derived);
 if(info.error||!info.data||!Number.isSafeInteger(Number(info.data.size))||
    Number(info.data.size)<1||Number(info.data.size)>15*1024*1024)
  throw Error('Derived private video size invalid');
 results.derivedPrivate=true;results.derivedWithin15MiB=true;
 const first=await db.storage.from(ORIGINAL).info(path(0));
 const last=await db.storage.from(ORIGINAL).info(path(41));
 results.sourceChunksCleaned=!!first.error&&!!last.error&&!!row.data.chunks_cleaned_at;
 if(!results.sourceChunksCleaned)throw Error('Private original chunk cleanup unverified');
}catch(e){failure=e instanceof Error?e.message:'Synthetic 250 MiB fixture failed';}
finally{
 // Exact synthetic paths only; never a prefix-wide listing or real user file.
 try{
  for(let i=0;i<Math.ceil(TOTAL/CHUNK);i+=30){
   const names=Array.from({length:Math.min(30,Math.ceil(TOTAL/CHUNK)-i)},
     (_,j)=>path(i+j));
   const deleted=await db.storage.from(ORIGINAL).remove(names);
   if(deleted.error)throw Error('Original test chunks failed cleanup');
  }
  const video=await db.storage.from(DERIVED).remove([derived]);
  if(video.error)throw Error('Derived test asset failed cleanup');
  const record=await db.from(TABLE).delete().eq('id',id);
  if(record.error)throw Error('Test reservation could not be removed');
  const [remaining,row]=await Promise.all([
   db.storage.from(ORIGINAL).list(prefix,{limit:50}),
   db.from(TABLE).select('id').eq('id',id)
  ]);
  results.exactCleanup=!remaining.error&&!remaining.data?.length&&
   !row.error&&!row.data?.length;
 }catch(e){failure+=(failure?'; ':'')+(e instanceof Error?e.message:'Cleanup failure');}
 await rm(dir,{recursive:true,force:true}).catch(()=>{});
}
const pass=!failure&&results.stagedPrivate&&results.workerValidated&&results.exactCleanup;
console.log(JSON.stringify({result:pass?'PASS':'FAIL',checks:results,
 ...(failure?{failedStage:failure}:{})}));
if(!pass)process.exitCode=1;
