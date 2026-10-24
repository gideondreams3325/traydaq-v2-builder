# TRAYDAQ V2 user app — Google Play internal release

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

Play App Signing has been configured with the original matching private key after owner approval. The key was encrypted with Google's official PEPK tool and imported through Play Console. Google's active app-signing SHA-256 was verified against the original certificate above, and the signed AAB was accepted. The unused generated key was replaced before distribution; no key rotation was configured. Automatic installer protection is off for the intended Palmstore and manual APK distribution. Later distributed version codes must exceed 4. An actual phone update from 1.0.1/code 3 still needs testing.

## Current Console status and approval boundary

The free TRAYDAQ user app was created on 24 October 2026 after the owner approved the Developer Program Policies acknowledgement, Play App Signing terms, US export acknowledgement, original-key import and installer-protection change.

The verified 1.0.2/code 4 AAB is active on the internal testing track. Play Console reports it is available to the selected internal tester and has not been reviewed. It confirms target SDK 36, minimum API 24 and four ABIs. The original app-signing identity is retained.

The default English listing is saved as a draft with descriptions, the existing logo and a feature graphic. Social is selected as its category. Government, financial-features and health declarations are saved for later review submission. The remaining forms require owner-confirmed facts and operational evidence. Phone screenshots, public privacy/deletion/child-safety URLs, child-safety contact, audience/ads answers, review access and an applicable real playback demonstration remain outstanding. Do not certify incomplete drafts.

No open-testing, closed-testing or production release has been published. Public publishing requires separate owner approval. The internal track currently uses Google's temporary unreviewed package name until setup/review is complete. The personal developer account requires a separate closed test with 12 testers continuously opted in for 14 days before applying for production access; internal testing does not replace it.

## Build controls

`.github/workflows/google-play-aab.yml` runs on explicit workflow dispatch or the dedicated `.github/traydaq-google-play-aab-request.txt` marker. Ordinary source/branding changes do not start this build. It pins the verified private user source, reuses existing GitHub signing secrets, rejects a certificate mismatch, produces only user release files and removes temporary signing files.

The separate user APK workflow is aligned to 1.0.2/code 4. Its build-request marker was not changed during this preparation. Staff workflows and staff build-request files were checked and remain unchanged.

Never publish keystores, passwords, Base64 keystore values, PEPK private-key payloads, private source, service credentials or environment files as public artifacts. This release artifact includes only signed binaries and public verification material.

Official references:
- https://support.google.com/googleplay/android-developer/answer/9859152
- https://support.google.com/googleplay/android-developer/answer/9842756
- https://support.google.com/googleplay/android-developer/answer/9845334
- https://developer.android.com/google/play/requirements/target-sdk
