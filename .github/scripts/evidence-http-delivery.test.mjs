/**
 * Synthetic HTTP test of the actual confidential-case-evidence Edge handler.
 * Firebase identity and Supabase RPC/Storage are deterministic test doubles.
 * Only loopback HTTP is used: no live credentials, transfers or account changes.
 * Run alongside Builder's independent PostgreSQL 17 RPC/audit validation.
 */
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {runInNewContext} from 'node:vm';
import {createHash, webcrypto} from 'node:crypto';

const sourceRoot=resolve(process.env.TRAYDAQ_SOURCE_ROOT||'.');
const source=readFileSync(resolve(sourceRoot,'supabase/functions/confidential-case-evidence/index.ts'),'utf8');
const ts=createRequire(pathToFileURL(resolve(sourceRoot,'package.json')))('typescript');
const caseId='11111111-1111-4111-8111-111111111111';
const evidenceId='22222222-2222-4222-8222-222222222222';
const filePath=`${caseId}/${evidenceId}/synthetic.png`;
const file=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9XfV7XcAAAAASUVORK5CYII=','base64');
const sha256=input=>createHash('sha256').update(input).digest('hex');
const token='A'.repeat(90), reason='CASE_FRAUD_TEST';
let edgeHandler, state;
function reset(changes={}) {
 state={bytes:Buffer.from(file),expectedSha:sha256(file),sizeBytes:file.length,
  authorized:true,grantActive:true,revokeOnFinal:false,expireOnFinal:false,
  missingFile:false,events:[],...changes};
}
reset();
function client(){
 return {
  rpc:async(name,args)=>{
   if(name==='v2_case_staff_verified')return {data:args.p_uid==='isolatedAnalyst1',error:null};
   if(name==='v2_case_authorized_access'){
    if(!state.authorized||!state.grantActive||args.p_case_id!==caseId||args.p_evidence_id!==evidenceId){
     state.events.push('evidence_access_denied');
     return {data:{authorized:false},error:null};
    }
    state.events.push('evidence_access_requested');
    return {data:{authorized:true,path:filePath,contentSha256:state.expectedSha,sizeBytes:state.sizeBytes},error:null};
   }
   if(name==='v2_case_log_verified_delivery'){
    if(state.revokeOnFinal||state.expireOnFinal||!state.grantActive||
      args.p_case_id!==caseId||args.p_evidence_id!==evidenceId||args.p_content_sha256!==state.expectedSha)
     return {data:false,error:{message:'Grant or case expired'}};
    state.events.push('evidence_verified_for_delivery');
    return {data:true,error:null};
   }
   throw Error(`Unexpected RPC ${name}`);
  },
  storage:{from:bucket=>{
   assert.equal(bucket,'traydaq-confidential-case-evidence');
   return {download:async requested=>{
    assert.equal(requested,filePath);
    if(state.missingFile)return {error:{message:'missing'},data:null};
    return {error:null,data:new Blob([state.bytes],{type:'image/png'})};
   }};
  }}
 };
}
// Exact production handler code is transpiled unchanged except static imports.
// Those imports are replaced with test-local provider stand-ins (not user inputs).
const imports=source.match(/^import [^\n]+;\s*$/gm)||[];
assert.equal(imports.length,5,'Import drift must be reviewed before testing');
const sourceWithoutImports=source.replace(/^import [^\n]+;\s*$/gm,'');
for(const anchor of ["Deno.serve(async req=>{","v2_case_authorized_access",
 "v2_case_log_verified_delivery","crypto.subtle.digest('SHA-256',bytes)",
 "return new Response(bytes,{status:200"])
 assert.ok(sourceWithoutImports.includes(anchor),`Handler drift: missing ${anchor}`);
const transpiled=ts.transpileModule(sourceWithoutImports,{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},
 reportDiagnostics:true
});
assert.equal(transpiled.diagnostics?.length||0,0,'TypeScript parse diagnostics');
const sandbox={
 Deno:{env:{get:name=>name==='SUPABASE_URL'?'https://example.invalid':
    name==='SUPABASE_SERVICE_ROLE_KEY'?'synthetic-key':undefined},
  serve:callback=>{edgeHandler=callback;}},
 createRemoteJWKSet:()=>({}),
 jwtVerify:async jwt=>{
  if(jwt!==token)throw Error('Bad test JWT');
  return {payload:{sub:'isolatedAnalyst1',email:'analyst@example.invalid',auth_time:Date.now()/1000}};
 },
 createClient:()=>client(),
 firebaseAdminToken:async()=>'synthetic-admin-token',
 firebaseAccount:async(_token,_action,{localId})=>({
  users:[{localId:localId[0],email:'analyst@example.invalid',disabled:false}]
 }),
 readLimitedJsonObject:async req=>{
  try{const body=await req.text();return body.length>2048?{ok:false}:{ok:true,value:JSON.parse(body)};}
  catch{return {ok:false};}
 },
 caseVaultIntakeReady:()=>false,
 crypto:webcrypto,Response,Request,Blob,URL,Headers,Uint8Array,TextEncoder,Date
};
runInNewContext(transpiled.outputText,sandbox,{filename:'confidential-case-evidence/index.ts'});
assert.equal(typeof edgeHandler,'function');
const server=createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const incoming=new Request('http://127.0.0.1/local',
   {method:req.method,headers:req.headers,body:Buffer.concat(chunks)});
  const response=await edgeHandler(incoming);
  res.writeHead(response.status,Object.fromEntries(response.headers.entries()));
  if(response.body)await pipeline(Readable.fromWeb(response.body),res);
  else res.end();
 }catch{res.writeHead(500);res.end('Unexpected test server failure');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const endpoint=`http://127.0.0.1:${server.address().port}/`;
after(()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
function download(extra={}){
 return fetch(endpoint,{method:'POST',
  headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
  body:JSON.stringify({caseId,evidenceId,reason,action:'download',...extra})});
}
const verified=()=>state.events.filter(e=>e==='evidence_verified_for_delivery').length;

test('complete PNG is served over HTTP, bytes and SHA-256 match, events occur in order',async()=>{
 reset();
 const response=await download();
 assert.equal(response.status,200);
 assert.equal(response.headers.get('content-type'),'image/png');
 assert.match(response.headers.get('content-disposition')||'',/attachment/);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(response.headers.get('x-content-type-options'),'nosniff');
 const received=Buffer.from(await response.arrayBuffer());
 assert.deepEqual(received,file);
 assert.equal(sha256(received),sha256(file));
 assert.deepEqual(state.events,['evidence_access_requested','evidence_verified_for_delivery']);
});
test('same-size corrupted bytes: 503 and request-only audit',async()=>{
 const tampered=Buffer.from(file);tampered[tampered.length-15]^=1;
 reset({bytes:tampered});
 assert.equal((await download()).status,503);
 assert.equal(verified(),0);
 assert.deepEqual(state.events,['evidence_access_requested']);
});
test('truncated bytes: 503, no verified-delivery event',async()=>{
 reset({bytes:file.subarray(0,file.length-1)});
 assert.equal((await download()).status,503);
 assert.equal(verified(),0);
});
test('missing object after authorization: 503, request-only audit',async()=>{
 reset({missingFile:true});
 assert.equal((await download()).status,503);
 assert.deepEqual(state.events,['evidence_access_requested']);
});
test('revocation before final delivery: 403, no evidence released',async()=>{
 reset({revokeOnFinal:true});
 assert.equal((await download()).status,403);
 assert.deepEqual(state.events,['evidence_access_requested']);
});
test('case expiry before final delivery: 403, no verified event',async()=>{
 reset({expireOnFinal:true});
 assert.equal((await download()).status,403);
 assert.equal(verified(),0);
});
test('pre-revoked grant denies before file access',async()=>{
 reset({grantActive:false});
 assert.equal((await download()).status,403);
 assert.deepEqual(state.events,['evidence_access_denied']);
});
test('wrong evidence ID denies instead of leaking another object',async()=>{
 reset();
 assert.equal((await download({evidenceId:'33333333-3333-4333-8333-333333333333'})).status,403);
 assert.equal(verified(),0);
});
test('missing bearer token denies with no audit or file access',async()=>{
 reset();
 const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({action:'download',caseId,evidenceId,reason})});
 assert.equal(response.status,401);
 assert.deepEqual(state.events,[]);
});
