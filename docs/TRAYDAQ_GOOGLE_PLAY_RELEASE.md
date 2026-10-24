# TRAYDAQ V2 user app — Google Play release preparation

Prepared 24 October 2026. Scope: `com.traydaq.app` only. TRAYDAQ STAFF is excluded.

## Verified release candidate

- Version 1.0.2, versionCode 4; target and compile API 36; minimum API 24.
- Private user source: `644e0b2c2349ca9b400dc9b46a1f84a7a75968d3`, now on private main. Changes are limited to user version metadata and the About version label.
- Successful dedicated V2 Builder AAB run: https://github.com/gideondreams3325/traydaq-v2-builder/actions/runs/40075977197
- All 494 native tests, Expo checks, TypeScript, release compilation, package/target checks and persistent-certificate checks passed.
- Artifact: `TRAYDAQ-V2-User-Google-Play-AAB`, containing the signed AAB, matching signed user APK, final manifest, public certificate and JSON verification report. GitHub retention is 14 days.
- The workflow verifies all 36 64-bit native ELF libraries have 16 KiB LOAD alignment. Downloaded APK native-library ZIP alignment was also checked locally.

## Signing compatibility

Expected original user signing SHA-1:
`27:16:2C:23:B0:DC:E4:9B:23:C2:C2:65:21:B4:46:61:C3:B3:7D:B8`

Expected original user signing SHA-256:
`71:6A:68:F5:73:45:45:BC:9D:97:00:F0:45:D2:BF:B1:B1:08:7F:FE:73:20:21:F2:16:B3:2A:57:5F:03:F8:3D`

The AAB and companion APK use this same certificate. The original reference is successful user APK run 40043905049, version 1.0.1/code 3. A matching private backup has been verified; never substitute another historic key based on its alias alone.

Reusing the upload key does not by itself fix Play delivery signing. Before the internal update test, configure Play App Signing to use the original matching app-signing private key, then compare the Play-held app-signing certificate with these fingerprints. Do not accept a replacement Google-generated identity or rotate this key. Retain the same app-signing identity for Palmstore and manually installed APK updates. Later distributed version codes must exceed 4.

## Owner approval boundary

No app has been created or uploaded in Play Console. The prepared Create app form reports that `com.traydaq.app` is available. Creation requires the Developer Program Policies acknowledgement, Play App Signing Terms of Service and US export acknowledgement. The owner requires approval before Play App Signing configuration and public publishing. These acknowledgements remain unchecked.

The new-app form also offers an automatic protection installer check that can prompt non-Play installs to obtain the app from Google Play. Obtain approval to disable that restriction for the intended Palmstore/sideload distribution. Prepare the exact existing-key import for approval before transmitting the encrypted private key to Google.

Only internal testing is authorised after the required approvals. No open-testing or production release is authorised. Store copy, disclosure drafts, policy drafts, graphics and a device-test plan have been prepared separately. Privacy/deletion URLs, real phone screenshots, an applicable playback demonstration, child-safety contact and review access still require verification or owner review before a wider release. Do not certify draft declarations as already verified.

## Build controls

`.github/workflows/google-play-aab.yml` runs on explicit workflow dispatch or the dedicated `.github/traydaq-google-play-aab-request.txt` marker. Ordinary source/branding changes do not start this build. It pins the verified private user source, reuses existing GitHub signing secrets, rejects a certificate mismatch, produces only user release files and removes temporary signing files.

The separate user APK workflow is aligned to 1.0.2/code 4. Its build-request marker was not changed during this preparation. Staff workflows and staff build-request files were checked and remain unchanged.

Never publish keystores, passwords, Base64 keystore values, PEPK private-key payloads, private source, service credentials or environment files as public artifacts. This release artifact includes only signed binaries and public verification material.

Official references:
- https://support.google.com/googleplay/android-developer/answer/9859152
- https://support.google.com/googleplay/android-developer/answer/9842756
- https://support.google.com/googleplay/android-developer/answer/9845334
- https://developer.android.com/google/play/requirements/target-sdk
