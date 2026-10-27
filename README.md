# TRAYDAQ V2 — Public APK Builder

This is a **public build-controller repository**, not the TRAYDAQ V2 app
source. The real, canonical source must remain **private** at
[`gideondreams3325/traydaq-v2`](https://github.com/gideondreams3325/traydaq-v2).

The public builder checks out the private source into a temporary GitHub
Actions runner with a narrowly scoped **read-only** GitHub token. It runs
the actual React tests and build, then can package an **experimental**
Android debug APK with a temporary Capacitor shell. It uploads **only**
the APK. No private source files, service-account credentials, signing
keystores or build-time environment files are committed to this repo.

> Important: A public APK contains compiled JavaScript/client assets that
> can be inspected by its recipients. Never place backend secrets in React
> code. Also, build error logs on public Actions runs may quote a short
> line of source; review before sharing logs.

## First-time setup on Android (GitHub mobile browser)

1. Create a new **public** GitHub repository named
   `gideondreams3325/traydaq-v2-builder`, initialized with a README.
   **Do not change the private source repository's visibility.**
2. Copy this README into the public repository root and copy
   `.github/workflows/build.yml` into the same path there. The template
   source files live under `public-builder-template/` in the private
   repository until copied.
3. Create a **fine-grained personal access token** with access to **only**
   the private `traydaq-v2` repo and **Contents: read-only**. Set an
   expiration. Do not grant repository administration or other scope.
4. Open public builder → **Settings → Secrets and variables → Actions →
   New repository secret**. Name the secret
   `TRAYDAQ_V2_SOURCE_READ_TOKEN` and paste the token **only there**.
   Never paste tokens in chat, public commits, logs or workflow inputs.
5. Go to **Actions → TRAYDAQ V2 Public Builder → Run workflow**, select
   **web-check** and branch `feat/v2-live-data-foundation`.
   If it fails **before any steps** as the private repo did, review your
   GitHub Actions account/billing/permissions and GitHub's runner status:
   moving to public does not guarantee that account-level restrictions
   disappear.

## Optional Android preview build

The new V2 React repo does not yet contain a production-tested Android
wrapper. This workflow can create a **temporary Capacitor Android 7
wrapper**, with application ID `com.traydaq.app`, for **preview only**.

A stable signing key is required. Before selecting `android-preview`,
place the Base64 encoding of your **persistent Android debug keystore**
in a second public builder Actions secret:
`TRAYDAQ_V2_DEBUG_KEYSTORE_B64`.

The keystore must have the standard debug alias `androiddebugkey` and
the Android debug password `android`. The keystore is private. Its SHA-1
and SHA-256 fingerprints need to be registered in the **new** Firebase
project `traydaq` before testing native Google sign-in. Keep a secure
backup so subsequent APKs retain the same signing certificate.

When Actions succeeds, download the workflow artifact
**TRAYDAQ-V2-debug-preview**. It contains a debug APK for testing,
**not a production release**. Do not distribute this as working
Firebase/Google login until the migration and native redirect tests pass.

## Security and release limitations

- Workflow runs **manually only** (`workflow_dispatch`). Do not run
  untrusted pull requests with the private-source token.
- Private source is fetched using `persist-credentials: false`.
- The public builder's token is scoped to **read-only** private source.
- No service-account keys, Supabase service-role keys, Android signing
  keys or private account data are public.
- V2 Firebase Auth cutover, Google sign-in in Android, image moderation,
  marketplace publishing and complete end-to-end tests are still in
  development. A generated APK alone cannot make them ready.
- Old public `gideondreams3325/traydaq` and legacy `sellerflow`
  repositories and backends remain untouched.

## Validation of the private TRAYDAQ app (PR #66)

**Canonical source:** private `gideondreams3325/traydaq-v2`. **Public build controller:** this repository, `gideondreams3325/traydaq-v2-builder`. **Web deployment platform: Cloudflare Workers** (the private source's `wrangler.jsonc`, using `./dist` assets). Do not treat Vercel checks as TRAYDAQ deployment requirements.

Use **Actions → TRAYDAQ V2 Private Source Validation (Cloudflare + Android)** to verify the currently staged deletion branch `feat/restore-owner-deletion-without-recovery-20261027` in the private repository. This separate workflow runs the private web test suite, web TypeScript check, Cloudflare-targeted web build, native tests and native TypeScript check, without committing private source to this public repo.

The `TRAYDAQ_V2_SOURCE_READ_TOKEN` secret must have read-only access to the private repository. Diagnostics from tests, installation, and compilation stay on the temporary runner; the public workflow displays pass/fail and test counts only. **It does not deploy to Cloudflare, sign an APK, erase accounts, change the database, or publish a source artifact.** Failed checks must be fixed in the private repository and then rerun here before any release.

The separate `build.yml` workflow still builds signed Android releases from **private main** only. Do not substitute it for PR #66 validation or mistake a successful APK compile for certified account/content erasure.
