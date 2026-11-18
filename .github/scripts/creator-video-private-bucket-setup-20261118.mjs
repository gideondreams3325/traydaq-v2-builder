// One-time isolated creator-originals bucket setup. NO existing customer bucket
// or object may be modified here. Run only from trusted Builder main.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const PROJECT='qpcsruhwqhniprakpoox';
const BUCKET='traydaq-creator-video-originals';
const MAX_BYTES=250*1024*1024;
const secret=process.env.SUPABASE_SECRET_KEY||'';
if(!secret.startsWith('sb_secret_'))throw Error('Expected a masked project secret key; refusing bucket configuration');
const {createClient}=createRequire(resolve('private-src/package.json'))('@supabase/supabase-js');
const client=createClient('https://'+PROJECT+'.supabase.co',secret,{auth:{persistSession:false,autoRefreshToken:false}});
const found=await client.storage.getBucket(BUCKET);
let created=false;
if(found.error){
 // Only create when Storage confirms the bucket is missing, not for unknown API failures.
 if(found.error.statusCode!=='404'&&found.error.status!==404)throw Error('Cannot distinguish inaccessible bucket from absent bucket');
 const made=await client.storage.createBucket(BUCKET,{
  public:false,fileSizeLimit:MAX_BYTES,allowedMimeTypes:['video/mp4']
 });
 if(made.error)throw Error('Cannot create private 250 MiB video bucket: '+String(made.error.message).slice(0,180));
 created=true;
}
const checked=await client.storage.getBucket(BUCKET);
if(checked.error||!checked.data)throw Error('Cannot read back isolated video bucket');
const b=checked.data;
const passed=b.public===false&&Number(b.file_size_limit)===MAX_BYTES&&
 Array.isArray(b.allowed_mime_types)&&b.allowed_mime_types.length===1&&
 b.allowed_mime_types[0]==='video/mp4';
console.log(JSON.stringify({
 status:passed?'PASS':'FAIL',created,private:b.public===false,
 maxBytes:Number(b.file_size_limit),mimeRestricted:passed,
 existingCreatorBucketsModified:false,accountRowsModified:false
}));
if(!passed)process.exitCode=1;
