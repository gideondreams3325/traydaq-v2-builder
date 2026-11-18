// Disposable processor proof: generate a valid, synthetic oversized MP4,
// upload it as owner-scoped 6MiB chunks, process through the real private worker,
// verify private output, then erase every fixture row/file. No Firebase users.
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {mkdtemp,rm,stat,readFile,appendFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
const PROJECT='qpcsruhwqhniprakpoox',ROOT='https://'+PROJECT+'.supabase.co',
 BUCKET='traydaq-creator-video-chunks',DERIVED='traydaq-native-creator-pending';
const TABLE='v2_creator_large_video_uploads',CHUNK=6*1024*1024;
const KEY=process.env.SUPABASE_SECRET_KEY||'';
if(!KEY.startsWith('sb_secret_'))throw Error('Missing masked project secret');
const {createClient}=createRequire(resolve('private-src/package.json'))('@supabase/supabase-js');
const db=createClient(ROOT,KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const uid='TRAYDAQSyntheticMedia',id=randomUUID(),logical=uid+'/'+id+'/original.mp4',
 derived=uid+'/'+id+'/0.mp4',folder=uid+'/'+id;
const part=i=>folder+'/chunk-'+String(i).padStart(3,'0')+'.bin';
const state={tableInitiallyEmpty:false,syntheticVideoCreated:false,partsUploaded:0,
 workerRun:false,privateDerivedVerified:false,processedDurationValid:false,
 sourcePartsRemoved:false,databaseRowRemoved:false,derivedRemoved:false,
 noFirebaseUserTouched:true,noPublicBucketWrites:true};
const dir=await mkdtemp(join(tmpdir(),'traydaq-large-video-fixture-'));
const file=join(dir,'source.mp4');
let failure='';
function ffmpeg(args){const r=spawnSync('ffmpeg',args,{timeout:90000,encoding:'utf8',maxBuffer:100000});
 if(r.error||r.status!==0)throw Error('Synthetic FFmpeg generation failed');}
try{
 const records=await db.from(TABLE).select('id',{count:'exact',head:true});
 if(records.error||records.count!==0)
  throw Error('Worker fixture refused: existing reservation records are present');
 state.tableInitiallyEmpty=true;
 const control=await db.from('v2_creator_large_video_controls').select('enabled')
  .eq('name','global').single();
 if(control.error||control.data?.enabled!==false)
  throw Error('Worker fixture requires large video uploads disabled');
 ffmpeg(['-hide_banner','-loglevel','error','-f','lavfi','-i',
  'testsrc2=size=320x240:rate=24','-t','3','-c:v','libx264','-pix_fmt',
  'yuv420p','-movflags','+faststart','-y',file]);
 const originalBytes=(await stat(file)).size;
 const target=18*1024*1024+123;
 const padding=target-originalBytes;
 if(padding<8||padding>20*1024*1024)throw Error('Unexpected synthetic video size');
 const header=Buffer.alloc(8);
 header.writeUInt32BE(padding,0);header.write('free',4,'ascii');
 await appendFile(file,Buffer.concat([header,Buffer.alloc(padding-8)]));
 const size=(await stat(file)).size;
 if(size!==target||size<=15*1024*1024||size>250*1024*1024)
  throw Error('Invalid synthetic original file size');
 state.syntheticVideoCreated=true;
 const n=Math.ceil(size/CHUNK);
 const inserted=await db.from(TABLE).insert({
  id,firebase_uid:uid,object_path:logical,original_bytes:size,
  chunk_count:n,mime_type:'video/mp4',state:'uploaded_unverified',
  expires_at:new Date(Date.now()+24*3600000).toISOString()
 }).select('id').single();
 if(inserted.error||inserted.data?.id!==id)throw Error('Synthetic session reservation failed');
 const data=await readFile(file);
 for(let i=0;i<n;i++){
  const bytes=data.subarray(i*CHUNK,Math.min((i+1)*CHUNK,size));
  const r=await db.storage.from(BUCKET).upload(part(i),bytes,{
   contentType:'application/octet-stream',cacheControl:'0',upsert:false
  });
  if(r.error)throw Error('Synthetic chunk '+i+' could not be uploaded');
  state.partsUploaded++;
 }
 // Run the actual private production worker once with a queue containing
 // exactly this one synthetic record. It must not access any account data.
 const child=spawnSync(process.execPath,['private-src/.github/scripts/process-large-creator-video.mjs'],{
  env:{...process.env,SUPABASE_SECRET_KEY:KEY},timeout:780000,encoding:'utf8',maxBuffer:100000
 });
 if(child.error||child.status!==0)throw Error('Private video worker exited unsuccessfully');
 state.workerRun=true;
 const row=await db.from(TABLE).select('state,derived_path,duration_seconds')
  .eq('id',id).single();
 if(row.error||row.data?.state!=='validated'||row.data?.derived_path!==derived)
  throw Error('Private processor did not validate synthetic MP4');
 state.processedDurationValid=Number(row.data.duration_seconds)>0&&Number(row.data.duration_seconds)<=180;
 const info=await db.storage.from(DERIVED).info(derived);
 state.privateDerivedVerified=!info.error&&Number(info.data?.size)>0&&Number(info.data?.size)<=15*1024*1024;
 if(!state.processedDurationValid||!state.privateDerivedVerified)
  throw Error('Derived private video failed verification');
 let missing=0;
 for(let i=0;i<n;i++){
  const check=await db.storage.from(BUCKET).info(part(i));
  if(check.error)missing++;
 }
 state.sourcePartsRemoved=missing===n;
 if(!state.sourcePartsRemoved)throw Error('Original synthetic fragments were not removed');
}catch(e){failure=e instanceof Error?e.message:'Synthetic worker failed';}
finally{
 for(let i=0;i<6;i++)await db.storage.from(BUCKET).remove([part(i)]).catch(()=>{});
 const result=await db.storage.from(DERIVED).remove([derived]);
 state.derivedRemoved=!result.error;
 const deleted=await db.from(TABLE).delete().eq('id',id).eq('firebase_uid',uid);
 const after=await db.from(TABLE).select('id',{count:'exact',head:true}).eq('id',id);
 state.databaseRowRemoved=!deleted.error&&!after.error&&after.count===0;
 await rm(dir,{recursive:true,force:true}).catch(()=>{});
}
const pass=Object.entries(state).every(([k,v])=>typeof v==='boolean'?v:true)&&
 state.partsUploaded>=3&&state.workerRun&&state.sourcePartsRemoved&&!failure;
console.log(JSON.stringify({result:pass?'PASS':'FAIL',checks:state,...(failure?{failure}:{})}));
if(!pass)process.exitCode=1;
