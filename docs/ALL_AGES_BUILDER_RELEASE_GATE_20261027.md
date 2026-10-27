# TRAYDAQ V2 builder — all-ages transition release gate

Status: **DRAFT / NO BUILD OR DEPLOYMENT AUTHORIZED** — 27 October 2026.

The product owner wants people of all ages to be able to use TRAYDAQ. The corresponding private-source design is `gideondreams3325/traydaq-v2/docs/ALL_AGES_ACCESS_ROLLOUT_20261027.md` (proposed branch `plan/all-ages-safe-access-20261027`). Do not treat this document as permission to publish a child-accessible social app without safeguards.

## Why the existing builder must not be relabeled or published

- `.github/workflows/age-12-draft-validation.yml` pins an earlier signup draft branch, not a completed all-ages implementation.
- `.github/workflows/age-12-draft-play-aab.yml` pins a specific old private-source commit and signed Android code 5 candidate. Renaming its artifact or workflow to "all ages" would misrepresent what was built.
- The separate older `google-play-aab.yml` is pinned to a different old release. None of these artifacts proves child-safe functionality, Play target-audience authorization or a published all-ages app.
- Preserve the existing private repo visibility, read-only source token, stable signing certificate and all key/secret handling. Do not re-run, publish or promote an AAB as part of a wording change.

## Conditions for a future all-ages preview candidate

1. Approve the private repo's adult/guardian and capability-based safety design. Children and unknown-age sessions must not gain unrestricted direct messaging, posting, personal-info exchange, commerce or public discoverability.
2. Require a *specific reviewed private-source SHA* and run web `npm run check`, native tests/typecheck, Android dependency validation, Firebase emulator/Edge tests and explicit mixed-age privacy/security contracts. Test abuse/reporting, moderation, block lists, account deletion, protected content, and guest/public content suitability.
3. Build signed binaries only from the reviewed SHA with the existing compatible signing key; keep release version and code monotonic and independently verify the package `com.traydaq.app`, certificate, Android target SDK, permissions and 16 KiB native library alignment.
4. Keep artifact clearly marked **PREVIEW — NOT PUBLISHED**. No auto-deployment, public source exposure, Play upload or tester recruitment without owner authorization.
5. Update Play Console audience and Families/UGC/Data Safety declarations, privacy/child safety pages and truthful app listing **after** implemented safeguards and device validation, not by changing a 12+ filename. Do not misstate current readiness.

**Current status:** no all-ages app build has been produced or validated by this document. Preserve the earlier 12+ and adult-only artifacts strictly as historical candidates, not all-ages releases.
