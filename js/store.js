/* ==========================================================
   Job Line — data store
   mode "github":   data/applications.json + device copy (localStorage)
   mode "firebase": Cloud Firestore, live sync, owner signs in to edit
   ========================================================== */
(function () {
  const CFG = window.JOBLINE_CONFIG;
  const LS_DATA = "jobline:data:v1";
  const LS_PREFS = "jobline:prefs:v1";

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  };

  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn());

  const Store = {
    mode: CFG.mode === "firebase" && CFG.firebase && CFG.firebase.projectId ? "firebase" : "github",
    apps: [],
    published: { updatedAt: null, settings: {} },
    dirty: false,
    remoteNewer: false,
    awaitingPush: false,
    user: null,
    ready: false,
    error: "",

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // ---------- settings (defaults ← published ← this device) ----------
    get settings() {
      const prefs = ls.get(LS_PREFS) || {};
      const pub = this.published.settings || {};
      return {
        ownerName: prefs.ownerName ?? pub.ownerName ?? CFG.ownerName ?? "",
        monthlyTarget: +(prefs.monthlyTarget ?? pub.monthlyTarget ?? CFG.monthlyTarget ?? 100),
        followUpAfterDays: +(prefs.followUpAfterDays ?? pub.followUpAfterDays ?? CFG.followUpAfterDays ?? 10),
        staleAfterDays: +(prefs.staleAfterDays ?? pub.staleAfterDays ?? CFG.staleAfterDays ?? 30),
        theme: prefs.theme || "auto"
      };
    },
    setPrefs(patch) {
      const prefs = Object.assign(ls.get(LS_PREFS) || {}, patch);
      ls.set(LS_PREFS, prefs);
      if (this.mode === "firebase" && this.canEdit()) {
        const { theme, ...shared } = patch;
        if (Object.keys(shared).length) this._fs.collection("meta").doc("settings").set(shared, { merge: true });
      } else if (this.mode === "github" && ("monthlyTarget" in patch || "ownerName" in patch || "followUpAfterDays" in patch || "staleAfterDays" in patch)) {
        this._markDirty();
      }
      emit();
    },

    canEdit() { return this.mode === "github" || !!this.user; },

    // ---------- lifecycle ----------
    async init() {
      if (this.mode === "firebase") {
        try { await this._initFirebase(); return; }
        catch (e) { console.error(e); this.error = "Firebase could not start — showing published data instead."; this.mode = "github"; }
      }
      await this._initGithub();
    },

    // ---------- GitHub / JSON mode ----------
    async _fetchPublished() {
      const url = CFG.dataUrl + (CFG.dataUrl.includes("?") ? "&" : "?") + "t=" + Date.now();
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Could not load ${CFG.dataUrl} (${res.status})`);
      return res.json();
    },

    async _initGithub() {
      const local = ls.get(LS_DATA);
      let remote = null;
      try { remote = await this._fetchPublished(); }
      catch (e) { this.error = navigator.onLine ? e.message : "You're offline — showing the copy saved on this device."; }

      if (remote) this.published = { updatedAt: remote.updatedAt, settings: remote.settings || {} };

      if (local && local.dirty) {
        // Keep this device's unpublished edits, but tell the user if GitHub has something newer.
        this.apps = local.apps;
        this.dirty = true;
        this.remoteNewer = !!(remote && remote.updatedAt && local.base && remote.updatedAt > local.base);
        if (!remote && local.published) this.published = local.published;
      } else if (remote && local && local.base && remote.updatedAt && local.base > remote.updatedAt) {
        // You exported but GitHub hasn't published that file yet — keep the newer device copy.
        this.apps = local.apps;
        this.awaitingPush = true;
        this.published = local.published || this.published;
      } else if (remote) {
        this.apps = remote.applications || [];
        this.dirty = false;
        this._saveLocal(remote.updatedAt);
      } else if (local) {
        this.apps = local.apps;
        this.published = local.published || this.published;
      }
      this._normalize();
      this.ready = true;
      emit();
    },

    _saveLocal(base) {
      const prev = ls.get(LS_DATA) || {};
      ls.set(LS_DATA, { base: base ?? prev.base ?? this.published.updatedAt, dirty: this.dirty, apps: this.apps, published: this.published });
    },
    _markDirty() { this.dirty = true; this._saveLocal(); },

    async loadPublished() {
      const remote = await this._fetchPublished();
      this.published = { updatedAt: remote.updatedAt, settings: remote.settings || {} };
      this.apps = remote.applications || [];
      this.dirty = false; this.remoteNewer = false; this.awaitingPush = false;
      this._normalize();
      this._saveLocal(remote.updatedAt);
      emit();
    },

    exportPayload() {
      const s = this.settings;
      const updatedAt = new Date().toISOString();
      return {
        updatedAt,
        settings: { ownerName: s.ownerName, monthlyTarget: s.monthlyTarget, followUpAfterDays: s.followUpAfterDays, staleAfterDays: s.staleAfterDays },
        applications: this.apps
      };
    },
    markPublished(payload) {
      this.published = { updatedAt: payload.updatedAt, settings: payload.settings };
      this.dirty = false; this.remoteNewer = false; this.awaitingPush = true;
      this._saveLocal(payload.updatedAt);
      emit();
    },

    // ---------- CRUD ----------
    async save(app) {
      if (!this.canEdit()) throw new Error("Sign in to make changes.");
      app.updatedAt = window.JL.today();
      if (this.mode === "firebase") {
        await this._fs.collection("applications").doc(app.id).set(JSON.parse(JSON.stringify(app)));
        return; // snapshot listener updates the list
      }
      const i = this.apps.findIndex(a => a.id === app.id);
      if (i >= 0) this.apps[i] = app; else this.apps.push(app);
      this._markDirty(); emit();
    },
    async remove(id) {
      if (!this.canEdit()) throw new Error("Sign in to make changes.");
      if (this.mode === "firebase") { await this._fs.collection("applications").doc(id).delete(); return; }
      this.apps = this.apps.filter(a => a.id !== id);
      this._markDirty(); emit();
    },
    async replaceAll(apps, { merge = false } = {}) {
      if (!this.canEdit()) throw new Error("Sign in to make changes.");
      let next = apps;
      if (merge) {
        const key = a => `${a.company}|${a.title}|${a.dateApplied}`.toLowerCase();
        const seen = new Set(this.apps.map(key));
        next = this.apps.concat(apps.filter(a => !seen.has(key(a))));
      }
      if (this.mode === "firebase") {
        const col = this._fs.collection("applications");
        const chunks = [];
        for (let i = 0; i < next.length; i += 400) chunks.push(next.slice(i, i + 400));
        if (!merge) {
          const existing = await col.get();
          const b = this._fs.batch(); existing.forEach(d => b.delete(d.ref)); await b.commit();
        }
        for (const c of chunks) { const b = this._fs.batch(); c.forEach(a => b.set(col.doc(a.id), JSON.parse(JSON.stringify(a)))); await b.commit(); }
        return next.length;
      }
      this.apps = next; this._normalize(); this._markDirty(); emit();
      return next.length;
    },

    _normalize() {
      this.apps.forEach(a => {
        a.history = Array.isArray(a.history) && a.history.length ? a.history : [{ status: a.status || "Applied", date: a.dateApplied }];
        a.followUps = Array.isArray(a.followUps) ? a.followUps : [];
        a.status = a.status || "Applied";
      });
    },

    // ---------- Firebase mode ----------
    _loadScript(src) {
      return new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not load " + src));
        document.head.appendChild(s);
      });
    },

    async _initFirebase() {
      const v = "10.12.2", base = `https://www.gstatic.com/firebasejs/${v}/`;
      await this._loadScript(base + "firebase-app-compat.js");
      await Promise.all([this._loadScript(base + "firebase-firestore-compat.js"), this._loadScript(base + "firebase-auth-compat.js")]);
      const fb = window.firebase;
      fb.initializeApp(CFG.firebase);
      this._fs = fb.firestore();
      try { await this._fs.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* offline cache not available in this browser */ }
      this._auth = fb.auth();

      this._auth.onAuthStateChanged(u => { this.user = u ? { email: u.email } : null; emit(); });

      this._fs.collection("meta").doc("settings").onSnapshot(d => {
        this.published.settings = d.exists ? d.data() : {};
        emit();
      });

      await new Promise(resolve => {
        this._fs.collection("applications").onSnapshot(snap => {
          this.apps = snap.docs.map(d => d.data());
          this._normalize();
          this.published.updatedAt = new Date().toISOString();
          this.ready = true;
          emit(); resolve();
        }, err => { this.error = "Firestore: " + err.message; this.ready = true; emit(); resolve(); });
      });
    },

    async signIn(email, password) { await this._auth.signInWithEmailAndPassword(email, password); },
    async signOut() { await this._auth.signOut(); },

    async seedFromJson() {
      const remote = await this._fetchPublished();
      if (remote.settings) await this._fs.collection("meta").doc("settings").set(remote.settings, { merge: true });
      return this.replaceAll(remote.applications || [], { merge: true });
    }
  };

  window.JLStore = Store;
})();
