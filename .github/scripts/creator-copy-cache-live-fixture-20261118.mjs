// Disposable Supabase creator-media cache proof; no user records or media accessed.
// Runs only from the owner-controlled Builder main workflow with a masked secret.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const PROJECT='qpcsruhwqhniprakpoox';
const ROOT='https://'+PROJECT+'.supabase.co';
const PENDING='traydaq-native-creator-pending';
const PUBLIC='traydaq-native-creator-public';
const key=process.env.SUPABASE_SECRET_KEY||'';
if(!key.startsWith('sb_secret_'))throw Error('Missing expected server-only fixture credential; no write performed.');
const {createClient}=createRequire(resolve('private-src/package.json'))('@supabase/supabase-js');
const client=createClient(ROOT,key,{auth:{autoRefreshToken:false,persistSession:false}});
const folder='__traydaq_cache_fixture__/'+randomUUID();
const source=folder+'/private.png';
const destination=folder+'/public.png';
const reference=folder+'/public-reference.png';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/RqsAAAAASUVORK5CYII=','base64');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const from=client.storage.from(PENDING),to=client.storage.from(PUBLIC);
const status={readOnlySource:false,privateSourceUploaded:false,sourceCachePrivate:false,copyAccepted:false,publicCacheVerified:false,publicContentTypeVerified:false,publicBytesVerified:false,privateSourceProtected:false,sourceRemoved:false,copyRemoved:false,referenceRemoved:false,referenceUploaded:false,referenceHeadAge:-1,copyHeadAge:-1,copyRenderAge:-1,referenceRenderAge:-1,copyRenderStatus:-1,referenceRenderStatus:-1,sourceInfoCache:'unknown',copyInfoCache:'unknown',referenceInfoCache:'unknown',existingMediaAccessed:false,productionRowsModified:false};
let stage='preflight',failure='';
function maxAge(response){
 const value=response.headers.get('cache-control')||'';
 const m=/(?:^|[,\s])max-age=(\d+)/i.exec(value);
 return m?Number(m[1]):-1;
}
async function absent(store,filename){
 const {data,error}=await store.list(folder,{limit:10});
 if(error||!Array.isArray(data))throw Error('Cannot confirm fixture inventory');
 return !data.some(file=>file.name===filename);
}
try{
 const [pending,publicBucket]=await Promise.all([client.storage.getBucket(PENDING),client.storage.getBucket(PUBLIC)]);
 if(pending.error||publicBucket.error||pending.data?.public!==false||publicBucket.data?.public!==true)
  throw Error('Existing creator bucket privacy settings differ from expected');
 if(!(await absent(from,'private.png'))||!(await absent(to,'public.png'))||!(await absent(to,'public-reference.png')))
  throw Error('Fixture path already exists');
 status.readOnlySource=true;
 stage='private-upload';
 const uploaded=await from.upload(source,new Blob([png],{type:'image/png'}),{
  contentType:'image/png',upsert:false,cacheControl:'0'
 });
 if(uploaded.error)throw Error('Synthetic private fixture could not be uploaded');
 status.privateSourceUploaded=true;

 stage='private-access';
 const privateUrl=from.getPublicUrl(source).data.publicUrl;
 const anon=await fetch(privateUrl,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(12000)});
 if(![400,401,403,404].includes(anon.status))throw Error('Private fixture unexpectedly publicly readable');
 status.privateSourceProtected=true;
 // HEAD for private source is authenticated and must retain max-age=0.
 const privateResponse=await fetch(ROOT+'/storage/v1/object/authenticated/'+PENDING+'/'+source,{
  method:'HEAD',headers:{apikey:key,Authorization:'Bearer '+key},
  redirect:'manual',signal:AbortSignal.timeout(12000)
 });
 status.sourceCachePrivate=privateResponse.ok&&maxAge(privateResponse)===0;
 if(!status.sourceCachePrivate) {
  const check=await from.info(source);
  status.sourceCachePrivate=!check.error&&
   String(check.data?.metadata?.cacheControl||'')==='max-age=0';
 }

 stage='cross-bucket-copy';
 // This EXACT body/header shape is used by PR #505's server-only helper.
 const copy=await fetch(ROOT+'/storage/v1/object/copy',{
  method:'POST',redirect:'manual',headers:{
   Authorization:'Bearer '+key,apikey:key,'Content-Type':'application/json'
  },
  body:JSON.stringify({
   bucketId:PENDING,sourceKey:source,destinationBucket:PUBLIC,destinationKey:destination,
   copyMetadata:false,metadata:{mimetype:'image/png',cacheControl:'max-age=3600'}
  }),signal:AbortSignal.timeout(15000)
 });
 status.copyAccepted=copy.ok;
 if(!copy.ok)throw Error('Copy endpoint did not accept metadata replacement (status '+copy.status+')');
 stage='public-HEAD';
 const publicUrl=to.getPublicUrl(destination).data.publicUrl;
 const probe=await fetch(publicUrl+'?cache_check='+randomUUID(),{
  method:'HEAD',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(12000)
 });
 status.copyHeadAge=probe.ok?maxAge(probe):-1;
 status.publicCacheVerified=probe.ok&&maxAge(probe)>=3600;
 status.publicContentTypeVerified=probe.ok&&
  (probe.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()==='image/png';
 stage='public-reference-upload';
 const referenceUpload=await to.upload(reference,new Blob([png],{type:'image/png'}),{contentType:'image/png',cacheControl:'3600',upsert:false});
 if(referenceUpload.error)throw Error('Public reference upload failed');
 status.referenceUploaded=true;
 const refUrl=to.getPublicUrl(reference).data.publicUrl;
 const refHead=await fetch(refUrl+'?cache_check='+randomUUID(),{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(12000)});
 status.referenceHeadAge=refHead.ok?maxAge(refHead):-1;
 const copyInfo=await to.info(destination);
 const refInfo=await to.info(reference);
 const sourceInfo=await from.info(source);
 const cacheValue=data=>String(data?.cacheControl||data?.cache_control||data?.metadata?.cacheControl||'unknown').slice(0,40);
 status.copyInfoCache=copyInfo.error?'unavailable':cacheValue(copyInfo.data);
 status.referenceInfoCache=refInfo.error?'unavailable':cacheValue(refInfo.data);
 status.sourceInfoCache=sourceInfo.error?'unavailable':cacheValue(sourceInfo.data);
 const [copyRender,refRender]=await Promise.all([destination,reference].map(name=>
  fetch(ROOT+'/storage/v1/render/image/public/'+PUBLIC+'/'+name+'?width=1&fixture='+randomUUID(),{
   method:'GET',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(12000)
  })
 ));
 status.copyRenderAge=copyRender.ok?maxAge(copyRender):-1;
 status.referenceRenderAge=refRender.ok?maxAge(refRender):-1;
 status.copyRenderStatus=copyRender.status;
 status.referenceRenderStatus=refRender.status;
 stage='public-GET';
 const downloaded=await fetch(publicUrl+'?byte_check='+randomUUID(),{
  method:'GET',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(12000)
 });
 if(downloaded.ok){
  const bytes=Buffer.from(await downloaded.arrayBuffer());
  status.publicBytesVerified=bytes.length===png.length&&sha(bytes)===sha(png);
 }
 if(!status.publicCacheVerified||!status.publicContentTypeVerified||!status.publicBytesVerified)
  throw Error('Public copy metadata or bytes failed verification');
}catch(e){
 failure=(e instanceof Error?e.message:'Fixture failure')+' at '+stage;
}finally{
 // Remove ONLY the freshly generated fixture filenames. Never list, mutate
 // or clean up other paths; exact-name presence is checked after deletion.
 try{
  const removed=await to.remove([destination,reference]);
  if(removed.error)throw Error('Unable to remove destination fixture');
  status.copyRemoved=await absent(to,'public.png');
  status.referenceRemoved=await absent(to,'public-reference.png');
 }catch{failure+=(failure?'; ':'')+'Destination cleanup unverified';}
 try{
  const removed=await from.remove([source]);
  if(removed.error)throw Error('Unable to remove source fixture');
  status.sourceRemoved=await absent(from,'private.png');
 }catch{failure+=(failure?'; ':'')+'Source cleanup unverified';}
}
const pass=!failure&&status.privateSourceUploaded&&status.privateSourceProtected&&
 status.sourceCachePrivate&&status.copyAccepted&&status.publicCacheVerified&&
 status.publicContentTypeVerified&&status.publicBytesVerified&&status.copyRemoved&&status.referenceRemoved&&status.sourceRemoved;
console.log(JSON.stringify({
 result:pass?'PASS':'FAIL',checks:status,
 ...(failure?{failedStage:failure}:{}),
 ...(!status.copyRemoved||!status.referenceRemoved||!status.sourceRemoved?{fixtureFolderForSafeManualCleanup:folder}:{})
}));
if(!pass)process.exitCode=1;
