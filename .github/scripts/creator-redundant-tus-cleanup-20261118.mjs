import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const root='https://qpcsruhwqhniprakpoox.supabase.co';
const key=process.env.SUPABASE_SECRET_KEY||'';
if(!key.startsWith('sb_secret_'))throw Error('Missing expected masked service key');
const {createClient}=createRequire(resolve('private-src/package.json'))('@supabase/supabase-js');
const db=createClient(root,key,{auth:{persistSession:false,persistSession:false}});
const bucket='traydaq-creator-large-video-private';
const oldTable='v2_creator_large_video_upload_sessions';
const activeBucket='traydaq-creator-video-chunks';
const sessions=await db.from(oldTable).select('id',{count:'exact',head:true});
if(sessions.error||sessions.count!==0)throw Error('Redundant upload reservation is not empty');
const [target,active]=await Promise.all([
 db.storage.getBucket(bucket),db.storage.getBucket(activeBucket)
]);
if(target.error||!target.data||target.data.public!==false||
   target.data.file_size_limit!==250*1024*1024||
   JSON.stringify(target.data.allowed_mime_types)!==JSON.stringify(['video/mp4']))
 throw Error('Redundant TUS bucket does not match isolated test configuration');
if(active.error||active.data?.public!==false||
   active.data?.file_size_limit!==6*1024*1024)
 throw Error('Authoritative chunk bucket not verified; cleanup refused');
const deleted=await db.storage.deleteBucket(bucket);
if(deleted.error)throw Error('Nonempty or unavailable redundant test bucket; no files deleted');
const check=await db.storage.getBucket(bucket);
if(!check.error)throw Error('Redundant bucket remains after deletion');
console.log(JSON.stringify({result:'PASS',redundantEmptyTUSBucketRemoved:true,
 authoritativeChunkBucketPreserved:true,customerObjectsRemoved:false,
 redundantSessionRows:0}));
