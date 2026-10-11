# LINKON — Overtime Calculator (Version 1)
Offline-first PWA, built by LINKON (change `APP_BUILDER` at the top of `app.js`). Records stay on the device; no server, login or analytics.

## Files
`index.html` (UI), `style.css`, `app.js` (logic + storage), `manifest.json`, `service-worker.js` (offline cache), `icon-192.png`, `icon-512.png`, `banner.jpg`, `profile.jpg` (logo images).

## Run locally
Service workers need http(s) or localhost: `cd Pakiza_OT && python3 -m http.server 8080`, then open http://localhost:8080.

## Test on Android
Same Wi-Fi: open `http://<computer-ip>:8080` in Chrome (install needs HTTPS, so use GitHub Pages below for the install test). Use the checklist in your brief; to test offline, load once, then enable airplane mode and reopen.

## GitHub + Pages
1. Create a repo, upload all files at the repo root (or `git push`).
2. Settings → Pages → Deploy from branch → `main` / root → Save.
3. Open `https://<username>.github.io/<repo>/`.

## Install on Android
Chrome → open the Pages URL → menu ⋮ → Install app / Add to Home screen.

## Later: Android package
Use Bubblewrap (`npm i -g @bubblewrap/cli`, `bubblewrap init --manifest <your-https-manifest-url>`, `bubblewrap build`) or PWABuilder.com to produce a Trusted Web Activity. It requires HTTPS hosting and a Digital Asset Links file. Keep your signing keystore private and backed up; never commit it.

## APK vs AAB
An APK is an installable file for direct/side-loading. An AAB (Android App Bundle) is the publishing format; new apps on Google Play are normally required to upload an AAB, and Google generates optimized APKs per device. Bubblewrap/PWABuilder can output both.

## AdMob (future, not included)
Wrap the app (TWA does not run AdMob; use a native/Capacitor wrapper with the Google Mobile Ads SDK), create your own AdMob IDs, test with Google's test IDs first, put banners only in non-intrusive spots, and make rewarded ads voluntary. Never click your own ads. Keep IDs out of source until needed.

## Premium (future)
Use Google Play Billing (via a native wrapper or the Digital Goods API in a TWA). Candidate features: ad removal, PDF/CSV export, unlimited history, cloud backup, multiple employees. Not implemented in Version 1.

## Google Play publishing
Create a Play developer account, create the app, complete the privacy policy, Data safety and content rating forms, upload the signed AAB to internal testing, then promote to production. Check current Play requirements (target API level, testing rules for new personal accounts) before release.

## Team view and invites (Version 1)
Supervisors can add workers' exported backup files in the Team tab to view them read-only. Everything stays on the supervisor's phone. Paid supervisor access, bKash payments and referral tracking need a server and are not included.

## Online account and supervisors (optional)
Uses a free Firebase project (`firebase-config.js`, `cloud.js`). Publish `firestore.rules` in Firebase Console -> Firestore -> Rules. Turn on Email/Password sign-in. To activate a paid supervisor: Firestore -> Data -> collection `supervisors` -> document ID = the supervisor's ID shown in the app -> field `active` (boolean) = true. Fill `BKASH_NUMBER` and `SUPERVISOR_PRICE` in `firebase-config.js`. No analytics are used.
