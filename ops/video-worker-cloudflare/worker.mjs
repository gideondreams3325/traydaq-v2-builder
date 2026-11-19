// TRAYDAQ independent video scheduler. No customer media, IDs or Supabase keys.
const ROOT = 'https://api.github.com/repos/gideondreams3325/traydaq-v2-builder';
const PRIMARY = 'creator-large-video-worker-scheduled-20261118.yml';
const BACKUP = 'creator-large-video-worker-fallback-20261119.yml';
const HEALTHY_WINDOW_MS = 15 * 60 * 1000;
const ACTIVE_WINDOW_MS = 35 * 60 * 1000;
const HEADERS = {'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'traydaq-video-scheduler'};

export async function checkAndDispatch(env, {request = fetch, now = Date.now()} = {}) {
  const token = env?.GITHUB_DISPATCH_TOKEN;
  if (typeof token !== 'string' || token.length < 20) {
    throw Error('Missing secure GitHub workflow dispatch credential');
  }
  const headers = {...HEADERS, Authorization:'Bearer ' + token};
  const runs = [];
  // Always check BOTH trusted worker workflows, not a mixed first page of repo runs.
  for (const workflow of [PRIMARY, BACKUP]) {
    const response = await request(ROOT + '/actions/workflows/' + workflow + '/runs?per_page=8', {
      headers, redirect:'error'
    });
    if (!response.ok) throw Error('Cannot verify GitHub worker run status');
    const body = await response.json();
    if (!Array.isArray(body?.workflow_runs)) throw Error('Malformed GitHub run status');
    for (const run of body.workflow_runs) {
      if (run.head_branch !== 'main' || run.path !== '.github/workflows/' + workflow) continue;
      const at = Date.parse(run.created_at);
      if (Number.isFinite(at) && at <= now && at > now - 24 * 60 * 60 * 1000) {
        runs.push({...run, age: now - at});
      }
    }
  }
  const running = runs.filter(run =>
    ['queued','requested','waiting','pending','in_progress'].includes(run.status));
  if (running.some(run => run.age >= ACTIVE_WINDOW_MS)) {
    throw Error('Trusted video worker stuck or queued too long; manual diagnosis required');
  }
  if (running.length > 0) return {decision:'running'};
  if (runs.some(run => run.conclusion === 'success' && run.age < HEALTHY_WINDOW_MS)) {
    return {decision:'recent-success'};
  }
  // A single POST only. GitHub workflow concurrency itself guards overlapping jobs.
  const result = await request(ROOT + '/actions/workflows/' + BACKUP + '/dispatches', {
    method:'POST', redirect:'error',
    headers:{...headers,'Content-Type':'application/json'},
    body:JSON.stringify({ref:'main'})
  });
  if (result.status !== 204) throw Error('GitHub rejected trusted workflow dispatch');
  return {decision:'dispatched'};
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(checkAndDispatch(env).then(result => {
      console.log('TRAYDAQ private video scheduler: ' + result.decision);
    }).catch(error => {
      // Never log response bodies, request headers, media or secrets.
      console.error('TRAYDAQ scheduler: ' + (error instanceof Error ? error.message : 'Unknown failure'));
      throw error;
    }));
  },
  async fetch() {
    return new Response('Not found', {status:404});
  }
};
