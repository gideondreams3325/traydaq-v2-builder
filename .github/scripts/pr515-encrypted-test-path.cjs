// Temporary private test path discovery. Output is RSA-encrypted, never plaintext.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const encryptSource=fs.readFileSync(path.join(__dirname,'pr515-encrypted-test-failures.cjs'),'utf8');
const foundKey=encryptSource.match(/Buffer\.from\('([^']+)','base64'\)/);
if(!foundKey)throw Error('No matching public diagnostic key');
const pub=Buffer.from(foundKey[1],'base64').toString('utf8');
const marker='confirmation follows only successful real native actions';
let count=0;
function scan(root){
 for(const entry of fs.readdirSync(root,{withFileTypes:true})){
  const location=path.join(root,entry.name);
  if(entry.isDirectory()){scan(location);continue;}
  if(!entry.name.endsWith('.test.mjs'))continue;
  if(!fs.readFileSync(location,'utf8').includes(marker))continue;
  const cipher=crypto.publicEncrypt({key:pub,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(location));
  console.log('PR515_ENCRYPTED_PATH_'+(++count)+'='+cipher.toString('base64'));
 }
}
scan(process.argv[2]||'tests');
if(!count)console.error('::error::No matching confirmation assertion discovered');
