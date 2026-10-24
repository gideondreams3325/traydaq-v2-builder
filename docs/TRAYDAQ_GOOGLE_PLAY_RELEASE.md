# TRAYDAQ V2 user app — Google Play release guide (October 2026)

## Scope
- Public user app ONLY: `com.traydaq.app`; never `com.traydaq.admin`.
- Target Android API: **36**; do not increase it for the initial release.
- Current source version as of preparation: **1.0.1**, versionCode **3**. The workflow reads the current values at build time and refuses versionCode below 3.
- Existing permanent TRAYDAQ user keystore and signing certificate must be reused. **Do not create or publish a new keystore.**

## Manual signed AAB workflow
1. Visit https://github.com/gideondreams3325/traydaq-v2-builder/actions/workflows/google-play-aab.yml
2. Use **Run workflow** on the default branch. This is manual-only and does not submit to Play.
3. The workflow checks out the private V2 main branch, validates app settings, runs Expo/typechecking/tests, compiles an AAB, and signs it with the existing `TRAYDAQ_V2_UPLOAD_KEYSTORE_*` secrets already used by the user APK workflow.
4. It verifies the bundle signature, certificate, application ID, version code, and exact **targetSdk 36** using pinned Google bundletool 1.18.3.
5. Download the `TRAYDAQ-V2-User-Google-Play-AAB` artifact only after a **successful** workflow run. The archive contains `app-release.aab` and expires according to GitHub's artifact-retention policy.

**No build has been run as part of preparing this workflow.** The AAB and its final manifest/signature are unverified until an actual successful run.

## Critical: Play App Signing and cross-store updates
Google Play uses **two distinct signing roles**: the local **upload key** that signs your `.aab` and the **app-signing key** Google uses to sign the APKs installed from Play. Reusing the existing upload key in CI **does not by itself guarantee** that the Play-installed app can update your manually installed or Palmstore APK.

If you want users to update an APK already signed with the original TRAYDAQ signing certificate **without uninstalling**:
- **Before your first open-testing or production release**, configure **Play App Signing** to use a copy of the original TRAYDAQ **app-signing key**, not Google's automatically generated replacement. Follow Google's secure PEPK/import process in Play Console. This requires access to the original private key, not only its certificate.
- Otherwise, if you accept a Google-generated Play app-signing key, expect the signature to differ from existing sideloaded APKs. You can instead download Play-generated, Play-signed distribution APKs for other stores after releasing through Play, and use a consistent signing strategy going forward.
- Never post keystore bytes, passwords, PEPK encrypted payloads, or secret values in a public issue, public CI logs, chat, or repository.
- Register the **Play app-signing** certificate SHA-1/SHA-256 with Firebase/Google OAuth after Google Play signing is configured. This is separate from the upload-key fingerprint.
- Future releases must have an increased `versionCode` regardless of which store publishes them.

Official references:
- https://support.google.com/googleplay/android-developer/answer/9842756
- https://developer.android.com/guide/app-bundle/faq
- https://support.google.com/googleplay/android-developer/answer/11926878

## Play Console steps (user-owned account)
1. Open https://play.google.com/console/ and **Create app** named **TRAYDAQ** (Apps, free if the install is free).
2. Complete all required publisher/developer details and the store listing.
3. Enter the genuine privacy policy URL, support contacts, access/account deletion details, age/target audience, content rating, and accurate **Data safety** disclosures. The current repo's privacy/legal copy is explicitly a draft with placeholders; do not mark those fields complete without verification.
4. Supply real current app screenshots, an appropriate icon, and graphics as requested. Do not use generated UI screenshots to misrepresent the actual product.
5. Configure **Play App Signing** carefully using the cross-store decision above.
6. Upload the signed `.aab` to **Internal testing** and verify Google sign-in, real accounts, profile, post uploads, music playback/background audio, chats, marketplace orders, jobs, events, notifications, staff moderation outcomes, deletion/appeals and privacy access from a Play-installed test device.
7. Complete closed testing if your developer account is required to do so. Publish to production only when policy review and tests are complete.

Do not submit the TRAYDAQ STAFF app publicly. Do not change API 36 or signing credentials as part of this work.
