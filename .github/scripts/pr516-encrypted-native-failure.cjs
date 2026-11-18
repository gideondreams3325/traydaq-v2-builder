const fs=require('node:fs');
const crypto=require('node:crypto');
// Only ciphertext leaves the temporary public Builder repository.
// The private key stays local and is never committed or uploaded.
const lines=fs.readFileSync(process.argv[2],'utf8').split(/\r?\n/);
const cases=[];
for(let i=0;i<lines.length;i++){
 if(/^\s*not ok \d+ - /.test(lines[i])){
  let end=i+1;
  while(end<lines.length&&!/^\s*(?:not ok \d+ - |ok \d+ - |1\.\.\d+|# tests )/.test(lines[end])&&end-i<90)end++;
  cases.push(lines.slice(i,end).join('\n').slice(0,3500));
 }
}
const message=JSON.stringify({cases:cases.slice(0,5),totals:lines.filter(x=>/^# (?:tests|pass|fail) \d+$/.test(x))});
const aes=crypto.randomBytes(32),iv=crypto.randomBytes(12);
const cipher=crypto.createCipheriv('aes-256-gcm',aes,iv);
const ciphertext=Buffer.concat([cipher.update(message,'utf8'),cipher.final()]);
const pub=Buffer.from('LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQm9qQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FZOEFNSUlCaWdLQ0FZRUFxaXBjcVhlWEllR1hZMGRSVUZkTwpmdi9oWEpXdUl0OWZINS9ZL29veXVNMnVJZ2ZoK2paR2swUmdvd25QM3k1SWFZcll0U0pVdHlsaEJrTVIrVkRECi9lOExBejNMUHZYZ294QUE4dGZ6alpubVlENVo4RTlTekVFMElCK1NmU0NKcHY3aEpiSkdzNVZjZjZSZW1TSmkKYVhpWGlyQ2cwU2ZQUkFSVmdTVUw0eklNK2tuWUFTTVIwNWwyd2t0NmowUmtXNTAzeStBbngxWjVJSDBycFE1WApobDV2dVJ3NVA2clhla0ZML2N1RWJTdk55ck50K0Vpd3ZpT3JCdFpUMjQ4TldlTWNSZ3BobEcyVFRLZ0E0eUdiCkl3M3lBRGdVN3BwSUpMTUdQa0xEZmdlMTRkcnZGR3l1Y0dxTjVDbnJVRS9EbERxdWNCdGZUcndaNzhycURtZ24KcHNMaTByZUNDMzdibElTSXNFcXlnRlhoem15dmgrbVhPQVIwNm4vb0cwQXNhRUxUZ29RNFh4Q0ZVNUtyT25GSwpBUE1MamRDZ0NOWWY4SVhtS3pDZkkydTc2OXp0d0tMNVpJVDRBSEdROW80d3liYnpoQjdyNGs4d0k2N1hzMGs4ClpGUEFUNjZmWHEvaEZBa2xPeFhENHVkRnF1T0Mvck94M1VpVjh3WkxMZUNqQWdNQkFBRT0KLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==','base64').toString('utf8');
const protectedKey=crypto.publicEncrypt({key:pub,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},aes);
const envelope={key:protectedKey.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),cipher:ciphertext.toString('base64')};
console.log('PR516_PRIVATE_DIAG='+Buffer.from(JSON.stringify(envelope)).toString('base64'));
const shortCase=(cases[0]||'No case found').slice(0,250);
const short=crypto.publicEncrypt({key:pub,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(shortCase,'utf8'));
console.log('PR516_SHORT_RSA='+short.toString('base64'));
