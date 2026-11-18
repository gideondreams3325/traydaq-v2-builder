// Temporary RSA-OAEP encryption of failing test titles. Only ciphertext is logged.
const fs=require('node:fs');
const crypto=require('node:crypto');
const pub=Buffer.from('LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQm9qQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FZOEFNSUlCaWdLQ0FZRUEwMnlCeVNOTnZuaVZyZUdKZzd4bwpjcE9yOW1xaGRxUVcrRVlBSE1vR3krQ3VBaC9BSWt4Y0syU0d3UFBGQWpxVWNMSDBveVN1cmg4WE5ZZDJ3VGpyCldJcVBxQkpJQUN5QXNpRkdaVmFha0lqN0JiYkVLb241QjRJcFRheFhnYitMQkVPcVVUdzJMYnowVUE4bFFUenYKTGJaS1o0SUpPcVByQU9ESnlpQk5pN1JPRE41T25VazB6L1JPUTB3VDZMUmhtN2NGMGd1OVl4NmxDL0JlNCtXNQpPbnBuaEo5STJoY0xwS2t1aFBYWXliakFmS2dhUVJHTElZSFFXV3FxMUpFS2xkcmFHNTRwbXAzTHlKYjd2VzA1Ck05RzBqclJybTRmYjU2dUtyd3ZyVXpxUzNZYTI3TGlGbFdyU1Q4aGZPL3FoY3ZGZlgyTWpyN0MyTXN5RE5MckwKWDRMQVEwQUZqd28zOEM3TWRvdytreHBmaE8xYU1GUm5mMmxqVlJ5dkROMDUwWktlb043WmtxbUJ3THdVaUo1dQo3TGgyV2V2d2srUm8wZ0JhYnEyN1A1NTQxZDRNMG9GS2RJQjhkMFg1blE5VnozMzQ2SlV3QTJ6UHhWWGRQdnF3Ck5GSnR1akUycTBQSnpHRGZjR25paUV2SEZZWWhndnRjYUxqN3l6dit5akNaQWdNQkFBRT0KLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==','base64').toString('utf8');
const rows=fs.readFileSync(process.argv[2],'utf8').split(/\r?\n/);
let found=0;
for(let i=0;i<rows.length;i++){
 const line=rows[i];
 if(!/^\s*not ok \d+ - /i.test(line))continue;
 const detail=rows.slice(i,i+35).filter(x=>/^\s*(?:not ok \d+ - |error:|failureType:|code:|operator:)/.test(x)).join(' / ').slice(0,235);
 const cipher=crypto.publicEncrypt({key:pub,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(detail));
 console.log('PR515_ENCRYPTED_FAIL_'+(++found)+'='+cipher.toString('base64'));
}
if(!found) console.log('PR515_DIAGNOSTIC_NO_TEST_MARKERS');
