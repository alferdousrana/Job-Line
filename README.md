# Job Line — Malaysia job application tracker

Mobile-first web app (installable like an app) that turns the Excel tracker into a live dashboard:
pipeline shown as a transit line, automatic follow-up reminders, monthly target ring, charts and reports.

---

## 1. GitHub Pages e publish kora (default mode)

1. GitHub e notun repository banan, jemon `job-tracker`.
2. Ei folder er **sob file** upload/push korun (index.html, css/, js/, data/, icons/, sw.js, manifest.webmanifest, .nojekyll).
3. Repo → **Settings → Pages** → Source: `Deploy from a branch` → Branch: `main`, folder `/ (root)` → Save.
4. 1–2 minute por link pabe: `https://<username>.github.io/job-tracker/`
   Ei link jake share korben, se latest data soho dashboard dekhte pabe.

### Data update korar niyom
- App e (phone ba laptop) application add / edit / status change korun — ei device e save thake.
- **Settings → Export for GitHub** chaplei `applications.json` download hobe.
- Repo te `data/applications.json` file ta replace kore commit/push korun.
- Push er 1–2 minute por shared link e sobai notun data dekhbe.

Excel e kaj korte chaile: **Settings → Import Excel tracker** diye `.xlsx` file din, tarpor Export for GitHub.

```bash
# command line diye push
cp ~/Downloads/applications.json data/applications.json
git add data/applications.json
git commit -m "Update applications"
git push
```

> ⚠️ Public repo = sobai data dekhte parbe (company, recruiter phone number, notes).
> Notes e kokhono password rakhben na. Import er somoy "password:" thaka notes automatic muche dewa hoy.

---

## 2. Firebase mode (push chara live sync)

Protiti change sathe sathe sob device e update hobe — GitHub e bar bar push korte hobe na.
GitHub Pages sudhu app ta host korbe.

1. https://console.firebase.google.com → **Add project**.
2. **Build → Firestore Database → Create database** (production mode, region `asia-southeast1` — Singapore, Malaysia r kache).
3. **Build → Authentication → Get started → Email/Password** enable korun → **Users → Add user** (apnar email + password).
4. **Firestore → Rules** tab e `firestore.rules` file er lekha paste korun, `YOUR_EMAIL@gmail.com` er jaygay apnar email din → Publish.
5. **Project settings → Your apps → Web (</>)** → app register korun → je `firebaseConfig` dekhabe seta copy korun.
6. `js/config.js` e:
   ```js
   mode: "firebase",
   firebase: { apiKey: "...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." }
   ```
7. **Authentication → Settings → Authorized domains** e `<username>.github.io` add korun.
8. Push korun. App e **Settings → Sign in to edit** → tarpor **Copy data/applications.json into Firebase** chaplei purono 48 ta application database e chole jabe.

Link e je keu dhukle dekhte parbe (view only). Edit sudhu apni sign in kore korte parben.
(Firebase apiKey public thakle somossa nei — security ashe Firestore rules theke.)

---

## 3. Phone e app er moto install
- **Android (Chrome):** link open → menu ⋮ → *Install app* / *Add to Home screen*.
- **iPhone (Safari):** link open → Share → *Add to Home Screen*.

Home screen theke khulle full-screen app er moto chole, offline o sesh data dekhay.

---

## Automation ja nijer theke hoy
- Total, active, interview, offer, reply rate, channel report — sob live calculate hoy.
- Apply er **10 din** por "Follow-up due", **30 din** por "Gone quiet" (Settings e din change kora jay).
- "I followed up today" chaple reminder abar notun kore gona shuru hoy.
- Job link paste korle Channel r Applied Through automatic bosbe (LinkedIn, JobStreet, Hiredly, Michael Page…).
- Location theke state/region automatic (Selangor, Kuala Lumpur, Penang, Johor, Sabah…).
- Same company + same role abar dile duplicate warning.
- Status change korle timeline e date soho record, pipeline line e animation.
- Next action faka rakhle status onujayi suggestion dey.
- Monthly target ring + protidin koto ta apply korte hobe tar hisab.
- Salary text ("RM 5K - RM 13K") theke range r median.

## File structure
```
index.html              app shell
css/style.css           design
js/config.js            ← settings (mode, Firebase keys, lists)
js/logic.js             automation rules & calculations
js/store.js             GitHub JSON / Firebase data layer
js/charts.js            charts + transit-line animation
js/app.js               screens & interactions
data/applications.json  your data (replace this to update)
sw.js, manifest.webmanifest, icons/   installable app / offline
firestore.rules         Firebase security rules
```

After changing any code file, bump `VERSION` in `sw.js` so installed phones pick up the new version.
