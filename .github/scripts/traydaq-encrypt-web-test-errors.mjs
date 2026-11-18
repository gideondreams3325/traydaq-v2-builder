// Temporary private-test diagnostics. Only AES-GCM ciphertext + OAEP-protected key are printed.
import {readFileSync} from 'node:fs';
import {randomBytes,createCipheriv,publicEncrypt,constants} from 'node:crypto';
const log=readFileSync(process.argv[2],'utf8').replace(/\x1b\[[0-9;]*m/g,'');
const lines=log.split(/\r?\n/);
const failures=[];
for(let i=0;i<lines.length;i++){
 if(/^\s*not ok \d+ - /.test(lines[i])){
  let stop=i+1;
  while(stop<lines.length&&!/^\s*(?:not ok \d+ - |ok \d+ - |1\.\.\d+|# tests )/.test(lines[stop])&&stop-i<150)stop++;
  failures.push(lines.slice(i,stop).join('\n').slice(0,6500));
 }
}
const data=JSON.stringify({failures:failures.slice(0,12),summary:lines.filter(x=>/^# (tests|pass|fail|skipped) \d+$/.test(x)),failureCount:failures.length});
const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
const encrypted=Buffer.concat([cipher.update(data,'utf8'),cipher.final()]);
const publicKey="-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAwYItCufFEB2TNbiggoNM\nGCMDkgdoAN0f89dD90pH0FWJ3I6g0c2RYnN+Kmn7bVkoqb/RvlDIj96n8UAwRY1D\nydlFgiHK4PBFGPs+uDHrzmaB4te4xbOixL5jes13PIWrMhpxzsnZ/uiRyTXQjZjx\nAFhGZO8rgLB8jLbhA3DmmO7As4gBGMBA11di699+xRCysW5ySRSraB66w1r9oNAJ\nHuO5Ujw5y/rwMt12j/VYNDfuTuFaiPwGV0ufpylNtK1Q5fh1xBpwKBU1guuC4c44\n7XdKSLFuL5a76qebNbVGBVxLFyVAWq/Hcce5XSPTB3rsaZmTInylxsCUO4LrNYFJ\nlomPAmlzn6RgYxo6jpJK92NtiICQIaFOFHecV66oo4TKfsRbSx5dzBOJMOS8BkSl\neG5zYWD+6wFAdMH9WMfBRUBB4jNzF/h4HAlKNxag8xA3GgbKjb2k/5rpyLvgNGbd\nfuggoMUAuIrU1IUkCbtFmwB0pV+TVVVylGYLUlL2I8hRAgMBAAE=\n-----END PUBLIC KEY-----";
const protectedKey=publicEncrypt({key:publicKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key);
const envelope={key:protectedKey.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),cipher:encrypted.toString('base64')};
console.log('PRWEB_ENCRYPTED_DIAGNOSTICS='+Buffer.from(JSON.stringify(envelope)).toString('base64'));
console.log('WEB_FAILURE_COUNT='+failures.length);
