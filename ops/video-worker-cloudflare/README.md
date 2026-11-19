# TRAYDAQ independent 3-minute video-worker scheduler

The production 15-250 MiB creator MP4 processor is a **private FFmpeg GitHub Actions worker**. GitHub `schedule` may be dropped; on Nov 19, 2026 production heartbeat aged 383 minutes, causing uploads to return HTTP 503. A push-triggered worker ran successfully at 07:26 UTC.

This is a **second external schedule**, not a replacement for the trusted worker. Every five minutes the Cloudflare Worker checks both public Builder worker histories through GitHub's API. If neither has succeeded for 15 minutes and no run is active, it dispatches the existing reviewed **backup** workflow. The backup still checks the pinned private worker source, GitHub concurrency, owner-bound queue and FFmpeg media validation. Never bypass the 30-minute backend heartbeat gate, video duration limits or publication moderation.

## Deploy once in the existing Cloudflare account

1. In GitHub on mobile, open Settings → Developer settings → Personal access tokens → Fine-grained tokens. Restrict it to **only** `gideondreams3325/traydaq-v2-builder`, with **Actions: Read and write** and the shortest practical expiration. (GitHub's workflow dispatch requires Actions write.)
2. In Cloudflare Workers & Pages, create a new Worker named `traydaq-video-worker-watchdog`. Deploy `worker.mjs` as its module code. It has no public HTTP functionality.
3. In Worker Settings → Variables and Secrets, add a **Secret** named `GITHUB_DISPATCH_TOKEN`. Paste the token **in Cloudflare only**. Never save it in GitHub source, comments, Supabase client code, or ChatGPT.
4. Add the Cron Trigger `*/5 * * * *` (UTC), or deploy using `wrangler.jsonc` with Wrangler. A Pages deployment is **not** the same as deploying this scheduled Worker.
5. Check Cloudflare cron history and the existing Builder workflow, and read back `public.v2_creator_large_video_controls.worker_heartbeat_at` from Supabase. Confirm it stays under 30 minutes for at least two consecutive checks.
6. Rotate the token before expiration. Watch GitHub Actions usage and Cloudflare invocation quotas; neither platform guarantees 100% availability.

**Until deployment and the secret are configured, this directory is only validated source code; it does not create a live Cron Trigger.**

Run source tests: `node --test ops/video-worker-cloudflare/watchdog.test.mjs`.

Security notes: the Worker only reads GitHub workflow metadata and sends one authenticated dispatch; never accesses user data, video bytes or Supabase service credentials; fail-closed on bad API results, missing token, stuck jobs or permission errors.
