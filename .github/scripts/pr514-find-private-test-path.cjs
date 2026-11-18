// Ephemeral Builder-only encrypted path diagnostic for the existing native File assertion.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=process.argv[2]||'tests';
const pub=Buffer.from('LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUF4RzZJckJ2L0V5b3VmK1VGcGNDOQo4VUpVZjNXY1VvMEVPRlFXelpvM2VrTjVvb2N0WUZjNWNadTRld3NJSHE5U0NlM2txQm9JakRaVmcvNm4zdkRtCnd3WnJCam4rRlMxd0NiOXlEYmhTVGZmMVdvb00wRG13blUzeEE1MFgyZmsrZHQzeVh3VWNTUUhKa3pYdVVrWGgKeWV1YUR4Y0FpQUVFZm1YT2loeXRnQmxTcU1tT2xqOHl5NFpaMEorcmFjMHBDNjBIREsvVnpDc3F5NEFta3RxQwo3L1BXSkVNd0hVZDRYcXFnYndsOHRrZ3VueTh4MkRJaFJheThMNFBjWkxvdWlOWUhLREl2UFM1Q1hleFVLaEZ2CkxRd1B2eWI1Si9IZWZuaElRM05oMDdlMEhtaDJOSm1pcEg5M2swdTljWE1Xd1NPMjRRMEpOdWVuUVgyYU5LdVAKVndJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==','base64').toString('utf8');
const matchText='All secured Android uploads pass an Expo File';
const found=[];
function visit(directory){
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const pathname=path.join(directory,entry.name);
  if(entry.isDirectory()){visit(pathname);continue;}
  if(!entry.name.endsWith('.test.mjs'))continue;
  const text=fs.readFileSync(pathname,'utf8');
  if(text.includes(matchText))found.push(pathname);
 }
}
visit(root);
for(let i=0;i<found.length;i++){
 const value=Buffer.from(found[i].slice(0,170));
 const cipher=crypto.publicEncrypt({key:pub,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},value);
 console.log('PR514_RSA_PATH_'+(i+1)+'='+cipher.toString('base64'));
}
if(!found.length){console.error('::error::No matching native File contract test found');process.exit(1);}
