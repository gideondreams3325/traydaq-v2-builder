import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkAndDispatch} from './worker.mjs';

const NOW = Date.parse('2026-11-19T07:30:00Z');
const token = {GITHUB_DISPATCH_TOKEN:'github_pat_test_only_1234567890'};
const run = (age, status, conclusion, workflow) => ({
  created_at:new Date(NOW-age*60000).toISOString(),status,conclusion,head_branch:'main',
  path:'.github/workflows/'+workflow
});
const primary='creator-large-video-worker-scheduled-20261118.yml';
const backup='creator-large-video-worker-fallback-20261119.yml';
function mock(groups, resultStatus=204) {
  const urls=[];
  const request=async (url,options={}) => {
    urls.push({url,method:options.method||'GET',auth:options.headers?.Authorization});
    if(options.method==='POST') return {status:resultStatus,ok:resultStatus===204};
    const key=url.includes('/'+primary+'/')?primary:backup;
    return {ok:true,json:async()=>({workflow_runs:groups[key]||[]})};
  };
  return {urls,request};
}
test('recent trusted success prevents unnecessary FFmpeg runs',async()=>{
  const fake=mock({[primary]:[run(7,'completed','success',primary)]});
  assert.equal((await checkAndDispatch(token,{request:fake.request,now:NOW})).decision,'recent-success');
  assert.equal(fake.urls.filter(x=>x.method==='POST').length,0);
});
test('independent cron dispatches when neither GitHub schedule ran',async()=>{
  const fake=mock({[primary]:[run(52,'completed','success',primary)]});
  assert.equal((await checkAndDispatch(token,{request:fake.request,now:NOW})).decision,'dispatched');
  const posts=fake.urls.filter(x=>x.method==='POST');
  assert.equal(posts.length,1);
  assert.match(posts[0].url,/creator-large-video-worker-fallback-20261119.yml\/dispatches$/);
  assert.equal(posts[0].auth,'Bearer '+token.GITHUB_DISPATCH_TOKEN);
});
test('does not overlap a live private worker',async()=>{
  const fake=mock({[backup]:[run(9,'in_progress',null,backup)]});
  assert.equal((await checkAndDispatch(token,{request:fake.request,now:NOW})).decision,'running');
  assert.equal(fake.urls.filter(x=>x.method==='POST').length,0);
});
test('stuck worker requires diagnosis rather than accumulating queued jobs',async()=>{
  const fake=mock({[backup]:[run(45,'in_progress',null,backup)]});
  await assert.rejects(checkAndDispatch(token,{request:fake.request,now:NOW}),/stuck/);
  assert.equal(fake.urls.filter(x=>x.method==='POST').length,0);
});
test('GitHub status failure fails closed',async()=>{
  const fake=mock({});
  const request=async()=>({ok:false,status:403});
  await assert.rejects(checkAndDispatch(token,{request,now:NOW}),/verify/);
  assert.equal(fake.urls.length,0);
});
test('dispatch errors do not falsely claim recovery',async()=>{
  const fake=mock({},403);
  await assert.rejects(checkAndDispatch(token,{request:fake.request,now:NOW}),/rejected/);
});
test('missing credential is never silently bypassed',async()=>{
  const fake=mock({});
  await assert.rejects(checkAndDispatch({}, {request:fake.request,now:NOW}),/credential/);
  assert.equal(fake.urls.length,0);
});
