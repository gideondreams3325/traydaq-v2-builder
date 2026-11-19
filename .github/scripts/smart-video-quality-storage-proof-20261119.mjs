import {createClient} from '@supabase/supabase-js';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
const PROJECT='qpcsruhwqhniprakpoox';
const root='https://'+PROJECT+'.supabase.co';
const secret=process.env.SUPABASE_SECRET_KEY||'';
if(!secret||!(secret.startsWith('sb_secret_')||secret.split('.').length===3))
 throw Error('A private, properly scoped Supabase service secret is required');
const supa=createClient(root,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const privateBucket='traydaq-native-creator-pending',publicBucket='traydaq-native-creator-public';
const id=randomUUID(),uid='proof'+id.replaceAll('-','').slice(0,20);
const source=uid+'/'+id+'/0.mp4',dest=id+'/0.mp4',targetBytes=20*1024*1024;
const folder=mkdtempSync(join(tmpdir(),'traydaq-quality-proof-'));
const oldLimits=[],changed=[];
let privateWritten=false,publicWritten=false,success=false;
async function bucket(id){
 const {data,error}=await supa.storage.getBucket(id);
 if(error||!data)throw Error('Could not inspect bucket '+id);
 return data;
}
try{
 // Only these two already-protected buckets are changed, retaining their
 // exact publicness and MIME rules. All data access remains service-role-only.
 for(const name of [privateBucket,publicBucket]){
  const existing=await bucket(name);
  if(!existing.allowed_mime_types?.includes('video/mp4'))
   throw Error('Production video bucket MIME configuration is unsafe');
  const old=Number(existing.file_size_limit);
  if(!Number.isSafeInteger(old)||old<15*1024*1024)
   throw Error('Unexpected video bucket size configuration');
  oldLimits.push({name,old,public:existing.public,types:existing.allowed_mime_types});
  const {error}=await supa.storage.updateBucket(name,{
   public:existing.public,fileSizeLimit:250*1024*1024,
   allowedMimeTypes:existing.allowed_mime_types
  });
  if(error)throw Error('Storage cannot raise video bucket limit: '+error.message);
  changed.push(name);
  const check=await bucket(name);
  if(Number(check.file_size_limit)!==250*1024*1024||
     check.public!==existing.public)
   throw Error('Video bucket limit readback is incorrect');
 }
 // Build an actual playable MP4 and append an ISO BMFF free box to
 // exercise >15 MiB object transport without uploading personal media.
 const seed=join(folder,'seed.mp4');
 execFileSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','color=c=green:s=320x240:r=12',
  '-f','lavfi','-i','sine=frequency=440:sample_rate=32000',
  '-t','2','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',
  '-c:a','aac','-b:a','48k','-movflags','+faststart','-f','mp4',seed],
  {timeout:45000});
 const media=readFileSync(seed);
 if(media.length>=targetBytes-8)throw Error('Synthetic source is unexpectedly large');
 const free=Buffer.alloc(targetBytes-media.length);
 free.writeUInt32BE(free.length,0);free.write('free',4,'ascii');
 const bytes=Buffer.concat([media,free]);
 if(bytes.byteLength!==targetBytes)throw Error('Synthetic MP4 size is wrong');
 const sample=join(folder,'large.mp4');
 writeFileSync(sample,bytes);
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries',
  'format=duration','-of','json',sample],{encoding:'utf8',timeout:10000}));
 if(!Number.isFinite(Number(probe.format?.duration))||
    Number(probe.format.duration)<1)throw Error('Synthetic MP4 is not playable');
 const signed=await supa.storage.from(privateBucket).createSignedUploadUrl(source);
 if(signed.error||!signed.data?.signedUrl)
  throw Error('Storage cannot issue a signed creator video upload');
 const signedUrl=new URL(signed.data.signedUrl,root);
 if(signedUrl.origin!==root.slice(0,root.length)||
    !signedUrl.pathname.includes('/storage/v1/object/upload/sign/'+privateBucket+'/')||
    !signedUrl.searchParams.has('token'))
  throw Error('Signed Storage URL is unsafe');
 // The same client HTTP PUT is used by the native and browser implementations.
 const uploaded=await fetch(signedUrl,{method:'PUT',
  headers:{'Content-Type':'video/mp4'},body:bytes,signal:AbortSignal.timeout(180000)});
 if(!uploaded.ok)throw Error('Signed PUT did not succeed: HTTP '+uploaded.status);
 privateWritten=true;
 const info=await supa.storage.from(privateBucket).info(source);
 if(info.error||Number(info.data?.size)!==targetBytes)
  throw Error('Private signed upload did not retain exactly 20 MiB');
 const helper=readFileSync('supabase/functions/_shared/verifyLargeCreatorMp4.ts','utf8');
 const js=ts.transpileModule(helper,{compilerOptions:{module:ts.ModuleKind.CommonJS,
  target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext(js,{module,exports:module.exports,TextDecoder,Uint8Array,
  DataView,Number,Math,URL,fetch,AbortSignal,Error},{timeout:2000});
 const reader=module.exports.privateLargeMp4Reader(root,secret,privateBucket,source,targetBytes);
 const inspected=await module.exports.inspectLargeCreatorMp4(targetBytes,reader);
 if(!(inspected.durationSeconds>0))throw Error('Server-side MP4 range validation failed');
 // Cross-bucket copy does not pull the large file into an Edge Function.
 const copied=await supa.storage.from(privateBucket).copy(source,dest,
  {destinationBucket:publicBucket});
 if(copied.error)throw Error('Storage cross-bucket video copy failed: '+copied.error.message);
 publicWritten=true;
 const publicInfo=await supa.storage.from(publicBucket).info(dest);
 if(publicInfo.error||Number(publicInfo.data?.size)!==targetBytes||
    String(publicInfo.data.contentType||'').toLowerCase()!=='video/mp4')
  throw Error('Public video copy size/MIME was not verified');
 // Destroy only synthetic proof objects; never read or alter user media.
 const removedPublic=await supa.storage.from(publicBucket).remove([dest]);
 if(removedPublic.error)throw Error('Could not remove public synthetic media');
 publicWritten=false;
 const removedPrivate=await supa.storage.from(privateBucket).remove([source]);
 if(removedPrivate.error)throw Error('Could not remove private synthetic media');
 privateWritten=false;
 success=true;
 console.log('PASS: 250 MiB buckets, 20 MiB signed PUT, authentic MP4 range validation, Storage copy, synthetic cleanup');
}finally{
 if(publicWritten)await supa.storage.from(publicBucket).remove([dest]).catch(()=>{});
 if(privateWritten)await supa.storage.from(privateBucket).remove([source]).catch(()=>{});
 if(!success)for(const old of [...oldLimits].reverse()){
  if(!changed.includes(old.name))continue;
  const {error}=await supa.storage.updateBucket(old.name,{
   public:old.public,fileSizeLimit:old.old,allowedMimeTypes:old.types
  });
  if(error)console.error('WARNING: video bucket limit rollback failed for '+old.name);
 }
 rmSync(folder,{recursive:true,force:true});
}
