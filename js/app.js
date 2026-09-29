/* ==========================================================
   Job Line — UI
   ========================================================== */
(function () {
  const JL = window.JL, Store = window.JLStore, Charts = window.JLCharts, CFG = window.JOBLINE_CONFIG;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    view: "home", range: 30, search: "", status: "All", channel: "All", sort: "new",
    firstHomeRender: true, openId: null
  };

  /* ---------------- theme ---------------- */
  function applyTheme() {
    const t = Store.settings.theme;
    if (t === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }
  $("#themeBtn").addEventListener("click", () => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
    Store.setPrefs({ theme: dark ? "light" : "dark" });
    applyTheme(); Charts.destroyAll(); render();
  });

  /* ---------------- navigation ---------------- */
  function go(view, push = true) {
    if (!["home", "log", "report", "settings"].includes(view)) view = "home";
    const prev = state.view;
    state.view = view;
    $$(".view").forEach(v => v.classList.toggle("active", v.dataset.view === view));
    $$("[data-view].tab, .nav-btn").forEach(b => b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false"));
    document.body.dataset.view = view;
    if (push && prev !== view) history.pushState({ view }, "", "#" + view);
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    render();
  }
  $$(".tab, .nav-btn").forEach(b => b.addEventListener("click", () => go(b.dataset.view)));
  document.addEventListener("click", e => { const g = e.target.closest("[data-go]"); if (g) go(g.dataset.go); });
  window.addEventListener("popstate", e => {
    if (!$("#sheet").hidden) { closeSheet(false); return; }
    go((e.state && e.state.view) || location.hash.slice(1) || "home", false);
  });

  /* ---------------- toast & banner ---------------- */
  let toastTimer;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
  }
  function renderBanner() {
    const b = $("#banner");
    let html = "";
    if (Store.error) html = `<p>${esc(Store.error)}</p>`;
    else if (Store.mode === "github" && Store.remoteNewer) html = `<p>A newer version is published on GitHub.</p><button class="btn small" id="bnLoad">Load it</button>`;
    else if (Store.mode === "github" && Store.dirty) html = `<p>You have changes on this device that aren't published yet.</p><button class="btn small" id="bnExport">Export for GitHub</button>`;
    b.hidden = !html; b.innerHTML = html;
    const l = $("#bnLoad"); if (l) l.onclick = async () => { if (confirm("Replace this device's unpublished changes with the GitHub version?")) { await Store.loadPublished(); toast("Loaded the published data"); } };
    const x = $("#bnExport"); if (x) x.onclick = exportJson;
  }
  function renderSyncLabel() {
    const s = $("#syncLabel");
    if (!Store.ready) { s.textContent = "Loading…"; return; }
    if (Store.mode === "firebase") s.textContent = Store.user ? "Live · editing on" : "Live · view only";
    else if (Store.dirty) s.textContent = "Unpublished changes";
    else if (Store.awaitingPush) s.textContent = "Exported · waiting for your push";
    else s.textContent = Store.published.updatedAt ? "Updated " + JL.fmtDate(Store.published.updatedAt.slice(0, 10)) : "Local data";
    document.body.classList.toggle("read-only", !Store.canEdit());
  }

  /* ---------------- render dispatcher ---------------- */
  function render() {
    if (!Store.ready) return;
    renderSyncLabel(); renderBanner();
    if (state.view === "home") renderHome();
    if (state.view === "log") renderLog();
    if (state.view === "report") renderReport();
    if (state.view === "settings") renderSettings();
    if (state.openId && !$("#sheet").hidden && $("#sheet").dataset.mode === "detail") {
      const a = Store.apps.find(x => x.id === state.openId);
      if (a) renderDetail(a, false);
    }
  }

  /* ---------------- HOME ---------------- */
  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  }

  function renderHome() {
    const rules = Store.settings, apps = Store.apps;
    const st = JL.computeStats(apps, rules);
    const animate = state.firstHomeRender;

    const name = rules.ownerName ? `, ${rules.ownerName}` : "";
    $("#helloTitle").textContent = greeting() + name;
    const first = apps.map(a => a.dateApplied).filter(Boolean).sort()[0];
    const attn = JL.attentionItems(apps, rules);
    const follows = attn.filter(a => a.kind === "follow").length;
    $("#helloSub").textContent = apps.length
      ? `${st.total} applications since ${JL.fmtDate(first)}. ${follows ? `${follows} are due a follow-up.` : "Nothing overdue."}`
      : "Add your first application with the + button.";

    // transit line
    JLCharts.line($("#transitLine"), { counts: st.atStation, reached: st.reached, animate });
    $("#lineExits").innerHTML = [
      ["Rejected", st.rejected, "hibiscus"], ["Withdrawn", st.withdrawn, "mute"], ["Gone quiet", st.quiet, "mute"]
    ].map(([l, n, t]) => `<span class="exit tone-${t}"><i></i>${l}<b>${n}</b></span>`).join("");

    // KPIs
    const kpis = [
      ["Sent", st.total, ""], ["Active", st.active, ""], ["Interviews", st.interviews, ""],
      ["Offers", st.offers, ""], ["Replies", Math.round(st.replyRate * 100), "%"]
    ];
    $("#kpis").innerHTML = kpis.map(([l, v, u]) => `<div class="kpi"><p class="kpi-num"><span data-n="${v}">${animate && !reduce ? 0 : v}</span>${u}</p><p class="kpi-label">${l}</p></div>`).join("");
    if (animate) $$("#kpis [data-n]").forEach((el, i) => Charts.countUp(el, +el.dataset.n, 800, 200 + i * 90));

    // target ring
    const goal = rules.monthlyTarget || 100, done = st.thisMonth;
    const pct = Math.min(1, done / goal), C = 2 * Math.PI * 50;
    const ring = $("#ringFill");
    ring.style.strokeDasharray = C;
    if (animate && !reduce) { ring.style.strokeDashoffset = C; requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.strokeDashoffset = C * (1 - pct); })); }
    else ring.style.strokeDashoffset = C * (1 - pct);
    ring.classList.toggle("complete", pct >= 1);
    $("#targetGoal").textContent = goal;
    const td = $("#targetDone");
    if (animate) Charts.countUp(td, done, 1000, 300); else td.textContent = done;
    const now = new Date();
    const monthName = now.toLocaleDateString("en-MY", { month: "long" });
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
    const remain = Math.max(0, goal - done);
    $("#targetCaption").textContent = pct >= 1 ? `Target reached for ${monthName}` : `${remain} to go in ${monthName}`;
    $("#pace").innerHTML = pct >= 1
      ? `<p>Every extra application now is a bonus.</p>`
      : `<p>About <b>${Math.ceil(remain / daysLeft)}</b> a day for the next <b>${daysLeft}</b> day${daysLeft > 1 ? "s" : ""} gets you there.</p>`;

    // attention
    $("#attnCount").textContent = attn.length;
    $("#attnList").innerHTML = attn.length ? attn.slice(0, 6).map(it => `
      <li><button class="attn tone-${it.kind}" data-open="${it.app.id}">
        <span class="attn-mark"></span>
        <span class="attn-main"><strong>${esc(it.app.company)}</strong><small>${esc(it.text)}</small></span>
      </button></li>`).join("") + (attn.length > 6 ? `<li class="attn-more">+${attn.length - 6} more in Applications</li>` : "")
      : `<li class="empty-note">All caught up. New reminders appear here ${rules.followUpAfterDays} days after you apply.</li>`;

    // daily chart
    $$("#rangeSeg button").forEach(b => b.classList.toggle("on", +b.dataset.range === state.range));
    Charts.daily(JL.dailySeries(apps, state.range));
    $("#streakText").textContent = st.streak > 1 ? `${st.streak}-day application streak. Keep it going.` : st.streak === 1 ? "You applied today or yesterday — make it two in a row." : "No applications in the last two days.";

    Charts.channel(st.perChannel);

    const recent = apps.slice().sort((a, b) => (b.dateApplied || "").localeCompare(a.dateApplied || "")).slice(0, 5);
    $("#recentList").innerHTML = recent.map(a => `
      <li><button data-open="${a.id}"><span class="dot tone-${JL.statusTone(a.status)}"></span>
      <span class="mini-main"><strong>${esc(a.company)}</strong><small>${esc(a.title)}</small></span>
      <span class="mini-date">${JL.fmtShort(a.dateApplied)}</span></button></li>`).join("") || `<li class="empty-note">No applications yet.</li>`;

    state.firstHomeRender = false;
  }
  $("#rangeSeg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; state.range = +b.dataset.range; renderHome(); });

  /* ---------------- LOG ---------------- */
  function buildFilters() {
    const statuses = ["All"].concat(CFG.statuses, ["Follow-up due"]);
    $("#statusChips").innerHTML = statuses.map(s => `<button class="chip ${s === state.status ? "on" : ""}" data-status="${esc(s)}">${esc(s)}</button>`).join("");
    const ch = [...new Set(CFG.channels.concat(Store.apps.map(a => a.channel).filter(Boolean)))];
    $("#channelFilter").innerHTML = `<option value="All">All channels</option>` + ch.map(c => `<option ${c === state.channel ? "selected" : ""}>${esc(c)}</option>`).join("");
  }
  $("#statusChips").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; state.status = b.dataset.status; renderLog(); });
  $("#channelFilter").addEventListener("change", e => { state.channel = e.target.value; renderLog(); });
  $("#sortSelect").addEventListener("change", e => { state.sort = e.target.value; renderLog(); });
  $("#searchInput").addEventListener("input", e => { state.search = e.target.value; renderLog(); });

  function filteredApps() {
    const rules = Store.settings;
    const q = state.search.trim().toLowerCase();
    let list = Store.apps.filter(a => {
      if (state.status === "Follow-up due") { if (!JL.isWaiting(a) || JL.daysAgo(JL.lastTouch(a)) < rules.followUpAfterDays) return false; }
      else if (state.status !== "All" && a.status !== state.status) return false;
      if (state.channel !== "All" && a.channel !== state.channel) return false;
      if (q && ![a.company, a.title, a.location, a.notes, a.contact, JL.detectRegion(a.location)].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
    const by = {
      new: (a, b) => (b.dateApplied || "").localeCompare(a.dateApplied || "") || a.company.localeCompare(b.company),
      old: (a, b) => (a.dateApplied || "").localeCompare(b.dateApplied || ""),
      company: (a, b) => a.company.localeCompare(b.company),
      stage: (a, b) => JL.furthestStage(b) - JL.furthestStage(a) || (b.dateApplied || "").localeCompare(a.dateApplied || "")
    }[state.sort];
    return list.sort(by);
  }

  function appCard(a, rules) {
    const tone = JL.statusTone(a.status);
    const age = JL.daysAgo(JL.lastTouch(a));
    const due = JL.isWaiting(a) && age >= rules.followUpAfterDays;
    return `<button class="app-card tone-${tone}" data-open="${a.id}">
      <span class="ac-top"><strong class="ac-company">${esc(a.company)}</strong><span class="status-pill tone-${tone}">${esc(a.status)}</span></span>
      <span class="ac-title">${esc(a.title)}</span>
      <span class="ac-meta">
        <span class="tag">${esc(JL.detectRegion(a.location))}</span>
        <span class="tag">${esc(a.channel || "—")}</span>
        ${due ? `<span class="tag warn">Follow up</span>` : ""}
        <span class="ac-age">${JL.relDays(JL.daysAgo(a.dateApplied))}</span>
      </span>
    </button>`;
  }

  function renderLog() {
    buildFilters();
    $("#sortSelect").value = state.sort;
    const rules = Store.settings, list = filteredApps();
    $("#resultCount").textContent = `${list.length} of ${Store.apps.length} applications`;
    if (!list.length) {
      $("#appList").innerHTML = `<div class="empty"><p>No applications match these filters.</p><button class="btn" id="clearFilters">Clear filters</button></div>`;
      $("#clearFilters").onclick = () => { state.search = ""; state.status = "All"; state.channel = "All"; $("#searchInput").value = ""; renderLog(); };
      return;
    }
    if (state.sort === "new" || state.sort === "old") {
      const groups = [];
      list.forEach(a => { const g = groups[groups.length - 1]; if (g && g.date === a.dateApplied) g.items.push(a); else groups.push({ date: a.dateApplied, items: [a] }); });
      $("#appList").innerHTML = groups.map(g => `<div class="day-group"><h3 class="day-head"><span>${JL.fmtDate(g.date)}</span><small>${g.items.length}</small></h3>${g.items.map(a => appCard(a, rules)).join("")}</div>`).join("");
    } else {
      $("#appList").innerHTML = list.map(a => appCard(a, rules)).join("");
    }
  }

  /* ---------------- REPORT ---------------- */
  function renderReport() {
    const apps = Store.apps, st = JL.computeStats(apps, Store.settings);
    $("#reportSub").textContent = `${st.total} applications, ${Math.round(st.replyRate * 100)}% heard back, ${st.interviews} interview${st.interviews === 1 ? "" : "s"}`;
    const rows = Object.entries(st.perChannel).sort((a, b) => b[1].apps - a[1].apps);
    const pct = (n, d) => (d ? Math.round((n / d) * 100) + "%" : "0%");
    const tot = rows.reduce((t, [, v]) => ({ apps: t.apps + v.apps, replies: t.replies + v.replies, interviews: t.interviews + v.interviews, offers: t.offers + v.offers }), { apps: 0, replies: 0, interviews: 0, offers: 0 });
    const maxApps = Math.max(1, ...rows.map(r => r[1].apps));
    $("#channelTable").innerHTML = `
      <thead><tr><th>Channel</th><th>Applications</th><th>Replies</th><th>Interviews</th><th>Offers</th><th>Interview rate</th></tr></thead>
      <tbody>${rows.map(([c, v]) => `<tr><td>${esc(c)}</td><td><span class="bar-cell"><i style="--w:${(v.apps / maxApps) * 100}%"></i>${v.apps}</span></td><td>${v.replies}</td><td>${v.interviews}</td><td>${v.offers}</td><td>${pct(v.interviews, v.apps)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>Total</td><td>${tot.apps}</td><td>${tot.replies}</td><td>${tot.interviews}</td><td>${tot.offers}</td><td>${pct(tot.interviews, tot.apps)}</td></tr></tfoot>`;

    Charts.status(st.byStatus, CFG.statuses);
    Charts.region(st.byRegion);
    Charts.weekly(JL.weeklySeries(apps));

    const s = st.salaries;
    if (s.length) {
      const mids = s.map(x => x.mid).sort((a, b) => a - b);
      const median = mids[Math.floor(mids.length / 2)];
      const lo = Math.min(...s.map(x => x.min)), hi = Math.max(...s.map(x => x.max));
      $("#salaryBox").innerHTML = `
        <p class="salary-big">${JL.fmtRM(median)}</p><p class="salary-cap">typical midpoint across ${s.length} roles with a stated salary</p>
        <div class="salary-range"><span>${JL.fmtRM(lo)}</span><div class="sr-track"><i style="--p:${((median - lo) / Math.max(1, hi - lo)) * 100}%"></i></div><span>${JL.fmtRM(hi)}</span></div>
        <p class="salary-cap">${apps.length - s.length} applications have no salary listed.</p>`;
    } else $("#salaryBox").innerHTML = `<p class="empty-note">Add expected salaries to see the range.</p>`;

    const roles = JL.topRoles(apps);
    const maxR = Math.max(1, ...roles.map(r => r[1]));
    $("#roleCloud").innerHTML = roles.map(([w, n]) => `<span style="--s:${0.85 + (n / maxR) * 0.9}">${esc(w)}<small>${n}</small></span>`).join("") || `<p class="empty-note">No roles yet.</p>`;
  }

  /* ---------------- SETTINGS ---------------- */
  function renderSettings() {
    const s = Store.settings;
    $("#setName").value = s.ownerName; $("#setTarget").value = s.monthlyTarget;
    $("#setFollow").value = s.followUpAfterDays; $("#setStale").value = s.staleAfterDays;
    const info = Store.mode === "firebase"
      ? `<p><b>Firebase live database.</b> Changes sync to every device instantly. Anyone with the link can view; only you can edit after signing in.</p>`
      : `<p><b>GitHub file.</b> The app reads <code>${esc(CFG.dataUrl)}</code> from your repo. Edits stay on this device until you export and push.</p>
         <p class="muted">${Store.published.updatedAt ? "Published version: " + JL.fmtDate(Store.published.updatedAt.slice(0, 10)) : ""}${Store.dirty ? " — this device has unpublished changes." : ""}</p>`;
    $("#sourceInfo").innerHTML = info;
    const auth = $("#authBox");
    if (Store.mode !== "firebase") { auth.innerHTML = ""; }
    else if (Store.user) {
      auth.innerHTML = `<p class="muted">Signed in as ${esc(Store.user.email)}</p>
        <div class="btn-row"><button class="btn" id="seedBtn">Copy data/applications.json into Firebase</button><button class="btn ghost" id="signOutBtn">Sign out</button></div>`;
      $("#signOutBtn").onclick = () => Store.signOut().then(() => toast("Signed out"));
      $("#seedBtn").onclick = async () => { try { const n = await Store.seedFromJson(); toast(`Firebase now has ${n} applications`); } catch (e) { toast(e.message); } };
    } else {
      auth.innerHTML = `<form class="form-grid" id="signInForm">
        <label class="field"><span>Email</span><input type="email" id="authEmail" autocomplete="username" required></label>
        <label class="field"><span>Password</span><input type="password" id="authPass" autocomplete="current-password" required></label>
        <button class="btn primary" type="submit">Sign in to edit</button></form>`;
      $("#signInForm").onsubmit = async e => { e.preventDefault(); try { await Store.signIn($("#authEmail").value, $("#authPass").value); toast("Signed in — editing is on"); } catch (err) { toast("Sign-in failed: " + err.code?.replace("auth/", "")); } };
    }
    $("#versionText").textContent = `Job Line · ${Store.apps.length} applications · ${Store.mode === "firebase" ? "Firebase" : "GitHub"} mode`;
  }
  $("#saveSettings").addEventListener("click", () => {
    const n = v => Math.max(1, parseInt(v, 10) || 1);
    Store.setPrefs({ ownerName: $("#setName").value.trim(), monthlyTarget: n($("#setTarget").value), followUpAfterDays: n($("#setFollow").value), staleAfterDays: n($("#setStale").value) });
    state.firstHomeRender = true; toast("Settings saved");
  });

  /* ---------------- import / export ---------------- */
  function download(name, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function exportJson() {
    const payload = Store.exportPayload();
    download("applications.json", new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" }));
    if (Store.mode === "github") Store.markPublished(payload);
    toast("Exported. Replace data/applications.json in your repo and push.");
  }
  let xlsxReady;
  const loadXLSX = () => xlsxReady || (xlsxReady = new Promise((res, rej) => {
    if (window.XLSX) return res();
    const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = res; s.onerror = () => { xlsxReady = null; rej(new Error("Could not load the Excel reader. Check your connection.")); }; document.head.appendChild(s);
  }));
  $("#exportJson").addEventListener("click", exportJson);
  $("#exportXlsx").addEventListener("click", async () => {
    try {
      await loadXLSX();
      const ws = XLSX.utils.aoa_to_sheet(JL.appsToRows(Store.apps.slice().sort((a, b) => (a.dateApplied || "").localeCompare(b.dateApplied || ""))));
      ws["!cols"] = [28, 34, 30, 18, 12, 12, 16, 18, 14, 26, 40, 34, 26].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Job Tracker");
      XLSX.writeFile(wb, `job-tracker-${JL.today()}.xlsx`);
    } catch (e) { toast(e.message); }
  });
  $("#importXlsx").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      await loadXLSX();
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
      const apps = JL.rowsToApps(rows);
      const merge = confirm(`Found ${apps.length} applications.\n\nOK = add only the new ones\nCancel = replace everything`);
      const n = await Store.replaceAll(apps, { merge });
      toast(`${n} applications loaded`); state.firstHomeRender = true;
    } catch (err) { toast(err.message); }
  });
  $("#importJson").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const apps = Array.isArray(data) ? data : data.applications;
      if (!Array.isArray(apps)) throw new Error("This file has no applications list.");
      await Store.replaceAll(apps); toast(`${apps.length} applications restored`);
    } catch (err) { toast(err.message); }
  });
  $("#resetLocal").addEventListener("click", async () => {
    if (!confirm("Discard all unpublished changes on this device?")) return;
    try { await Store.loadPublished(); toast("Showing the published data"); } catch (e) { toast(e.message); }
  });

  /* ---------------- bottom sheet ---------------- */
  const sheet = $("#sheet"), backdrop = $("#sheetBackdrop");
  function openSheet(html, mode) {
    $("#sheetBody").innerHTML = html;
    sheet.dataset.mode = mode;
    if (sheet.hidden) {
      sheet.hidden = false; backdrop.hidden = false;
      requestAnimationFrame(() => { sheet.classList.add("open"); backdrop.classList.add("open"); });
      history.pushState({ view: state.view, sheet: true }, "");
      document.body.classList.add("sheet-open");
    }
    $("#sheetBody").scrollTop = 0;
  }
  function closeSheet(pop = true) {
    if (sheet.hidden) return;
    sheet.classList.remove("open"); backdrop.classList.remove("open");
    sheet.style.transform = "";
    document.body.classList.remove("sheet-open");
    setTimeout(() => { sheet.hidden = true; backdrop.hidden = true; }, reduce ? 0 : 320);
    state.openId = null;
    if (pop && history.state && history.state.sheet) history.back();
  }
  backdrop.addEventListener("click", () => closeSheet());
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });

  // drag the grip down to close
  (function dragToClose() {
    let y0 = null, dy = 0;
    const grip = $("#sheetGrip");
    grip.addEventListener("pointerdown", e => { y0 = e.clientY; dy = 0; sheet.style.transition = "none"; grip.setPointerCapture(e.pointerId); });
    grip.addEventListener("pointermove", e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`; });
    const end = () => { if (y0 === null) return; sheet.style.transition = ""; if (dy > 110) closeSheet(); else sheet.style.transform = ""; y0 = null; };
    grip.addEventListener("pointerup", end); grip.addEventListener("pointercancel", end);
  })();

  document.addEventListener("click", e => {
    const o = e.target.closest("[data-open]");
    if (o) { const a = Store.apps.find(x => x.id === o.dataset.open); if (a) { state.openId = a.id; renderDetail(a, true); } }
  });

  /* ---------------- detail ---------------- */
  function renderDetail(a, animate) {
    const rules = Store.settings, tone = JL.statusTone(a.status);
    const exit = JL.EXIT_STATUSES.includes(a.status);
    const cur = exit ? -1 : JL.stageIndex(a.status);
    const furthest = JL.furthestStage(a);
    const nextIdx = !exit && cur < JL.STATIONS.length - 1 ? cur + 1 : -1;
    const nextStatus = nextIdx >= 0 ? JL.STATIONS[nextIdx].statuses[0] : null;
    const suggestion = JL.suggestNext(a, rules);
    const events = (a.history || []).map(h => ({ date: h.date, text: h.status === a.history[0].status && h === a.history[0] ? `Applied via ${a.appliedThrough || a.channel || "—"}` : `Moved to ${h.status}`, tone: JL.statusTone(h.status) }))
      .concat((a.followUps || []).map(d => ({ date: d, text: "Followed up", tone: "follow" })))
      .sort((x, y) => (y.date || "").localeCompare(x.date || ""));
    const region = JL.detectRegion(a.location);
    const fact = (k, v) => v ? `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>` : "";
    const edit = Store.canEdit();

    openSheet(`
      <div class="d-head">
        <p class="d-date">Applied ${JL.fmtDate(a.dateApplied)}, ${JL.relDays(JL.daysAgo(a.dateApplied))}</p>
        <h2 id="sheetTitle" class="d-company">${esc(a.company)}</h2>
        <p class="d-title">${esc(a.title)}</p>
        <span class="status-pill big tone-${tone}">${esc(a.status)}</span>
      </div>
      <div class="d-line" id="dLine"></div>
      ${exit ? `<p class="d-exit tone-${tone}">Left the line at ${JL.STATIONS[furthest].label.toLowerCase()} — ${esc(a.status.toLowerCase())}.</p>` : ""}

      ${edit ? `<div class="d-actions">
        ${nextStatus ? `<button class="btn primary" data-move="${esc(nextStatus)}">Move to ${esc(JL.STATIONS[nextIdx].label)}</button>` : ""}
        ${JL.isWaiting(a) ? `<button class="btn" id="followBtn">I followed up today</button>` : ""}
        ${a.url && /^https?:/.test(a.url) ? `<a class="btn ghost" href="${esc(a.url)}" target="_blank" rel="noopener">Open job post</a>` : ""}
      </div>
      <div class="status-picker" role="group" aria-label="Set status">
        ${CFG.statuses.map(s => `<button class="chip tone-${JL.statusTone(s)} ${s === a.status ? "on" : ""}" data-move="${esc(s)}">${esc(s)}</button>`).join("")}
      </div>
      ${a.status === "Interview Scheduled" ? `<label class="field inline"><span>Interview date</span><input type="date" id="ivDate" value="${esc(a.interviewDate || "")}"></label>` : ""}`
      : (a.url && /^https?:/.test(a.url) ? `<div class="d-actions"><a class="btn ghost" href="${esc(a.url)}" target="_blank" rel="noopener">Open job post</a></div>` : "")}

      ${suggestion ? `<div class="next-box"><p class="next-label">${a.nextAction ? "Next action" : "Suggested next step"}</p><p>${esc(suggestion)}</p></div>` : ""}

      <dl class="facts">
        ${fact("Location", esc(a.location || "Not stated") + (region !== "Not stated" ? ` <span class="tag">${esc(region)}</span>` : ""))}
        ${fact("Channel", esc(a.channel))}
        ${fact("Applied through", esc(a.appliedThrough))}
        ${fact("Type", esc(a.type))}
        ${fact("Expected salary", esc(a.salary) + (JL.parseSalary(a.salary) && !/rm/i.test(a.salary) ? " MYR" : ""))}
        ${fact("Interview", a.interviewDate ? JL.fmtDate(a.interviewDate) : "")}
        ${fact("Recruiter / contact", esc(a.contact).replace(/\n/g, "<br>"))}
        ${fact("Notes", esc(a.notes).replace(/\n/g, "<br>"))}
      </dl>

      <h3 class="d-sub">Timeline</h3>
      <ol class="timeline">${events.map(ev => `<li class="tone-${ev.tone}"><span>${JL.fmtDate(ev.date)}</span>${esc(ev.text)}</li>`).join("")}</ol>

      ${edit ? `<div class="d-foot"><button class="btn" id="editBtn">Edit details</button><button class="btn ghost danger" id="delBtn">Delete</button></div>` : ""}
    `, "detail");

    JLCharts.line($("#dLine"), { counts: [0, 0, 0, 0], reached: JL.STATIONS.map((_, i) => (i <= furthest ? 1 : 0)), current: exit ? furthest : cur, mini: true, animate });
    if (exit) $("#dLine .tl-station.current")?.classList.add("exited");

    if (!edit) return;
    $$("#sheetBody [data-move]").forEach(b => b.onclick = () => moveStatus(a, b.dataset.move));
    const fb = $("#followBtn"); if (fb) fb.onclick = async () => { a.followUps = (a.followUps || []).concat(JL.today()); await Store.save(a); toast("Follow-up logged — next reminder in " + rules.followUpAfterDays + " days"); };
    const iv = $("#ivDate"); if (iv) iv.onchange = async () => { a.interviewDate = iv.value; await Store.save(a); toast("Interview date saved"); };
    $("#editBtn").onclick = () => renderForm(a);
    $("#delBtn").onclick = async () => { if (confirm(`Delete ${a.company} — ${a.title}?`)) { await Store.remove(a.id); closeSheet(); toast("Application deleted"); } };
  }

  async function moveStatus(a, status) {
    if (status === a.status) return;
    a.status = status;
    a.history = (a.history || []).concat({ status, date: JL.today() });
    if (status !== "Interview Scheduled") { /* keep date for the record */ }
    try {
      await Store.save(a);
      state.firstHomeRender = true;
      renderDetail(a, true);
      if (status === "Offer Received") celebrate();
      toast(`Moved to ${status}`);
    } catch (e) { toast(e.message); }
  }

  function celebrate() {
    if (reduce) return;
    const layer = document.createElement("div"); layer.className = "confetti";
    const colors = ["var(--gold)", "var(--hibiscus)", "var(--pandan)", "var(--sky)"];
    for (let i = 0; i < 40; i++) {
      const p = document.createElement("i");
      p.style.cssText = `--x:${Math.random() * 100}vw;--r:${Math.random() * 720 - 360}deg;--d:${0.9 + Math.random() * 1.2}s;--dl:${Math.random() * 0.3}s;background:${colors[i % 4]}`;
      layer.appendChild(p);
    }
    document.body.appendChild(layer); setTimeout(() => layer.remove(), 2600);
  }

  /* ---------------- add / edit form ---------------- */
  function opt(list, val) {
    const all = val && !list.includes(val) ? list.concat(val) : list;
    return all.map(x => `<option ${x === val ? "selected" : ""}>${esc(x)}</option>`).join("");
  }
  function renderForm(existing) {
    const a = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: JL.uid(), company: "", title: "", location: "", channel: "LinkedIn", dateApplied: JL.today(), type: "Full-time",
      salary: "", status: "Applied", appliedThrough: "LinkedIn", contact: "", url: "", notes: "", nextAction: "", interviewDate: "",
      history: [], followUps: []
    };
    openSheet(`
      <div class="d-head"><h2 id="sheetTitle" class="d-company">${existing ? "Edit application" : "New application"}</h2>
      <p class="d-title">${existing ? "Changes save to " + (Store.mode === "firebase" ? "the live database" : "this device") : "Paste the job link first — channel fills itself in"}</p></div>
      <form id="appForm" class="form-grid" novalidate>
        <label class="field span2"><span>Job posting link</span><input name="url" type="url" inputmode="url" value="${esc(a.url)}" placeholder="https://"></label>
        <label class="field span2"><span>Company</span><input name="company" required value="${esc(a.company)}" autocomplete="organization"></label>
        <label class="field span2"><span>Job title</span><input name="title" required value="${esc(a.title)}"></label>
        <p class="dup-warn span2" id="dupWarn" hidden></p>
        <label class="field span2"><span>Location</span><input name="location" value="${esc(a.location)}" placeholder="e.g. Petaling Jaya, Selangor"><small id="regionHint"></small></label>
        <label class="field"><span>Channel / source</span><select name="channel">${opt(CFG.channels, a.channel)}</select></label>
        <label class="field"><span>Applied through</span><select name="appliedThrough">${opt(CFG.appliedThrough, a.appliedThrough)}</select></label>
        <label class="field"><span>Date applied</span><input name="dateApplied" type="date" value="${esc(a.dateApplied)}" required></label>
        <label class="field"><span>Employment type</span><select name="type">${opt(CFG.employmentTypes, a.type)}</select></label>
        <label class="field"><span>Expected salary (MYR)</span><input name="salary" value="${esc(a.salary)}" placeholder="8000 or RM 5K - RM 8K"></label>
        <label class="field"><span>Status</span><select name="status">${opt(CFG.statuses, a.status)}</select></label>
        <label class="field span2" id="ivField" ${a.status === "Interview Scheduled" ? "" : "hidden"}><span>Interview date</span><input name="interviewDate" type="date" value="${esc(a.interviewDate)}"></label>
        <label class="field span2"><span>Recruiter / contact</span><textarea name="contact" rows="2">${esc(a.contact)}</textarea></label>
        <label class="field span2"><span>Notes & stage details</span><textarea name="notes" rows="3" placeholder="Don't store passwords here — they'd be public on GitHub.">${esc(a.notes)}</textarea></label>
        <label class="field span2"><span>Next action</span><input name="nextAction" value="${esc(a.nextAction)}" placeholder="Leave empty for an automatic suggestion"></label>
        <div class="btn-row span2"><button class="btn primary" type="submit">${existing ? "Save changes" : "Add application"}</button><button class="btn ghost" type="button" id="cancelForm">Cancel</button></div>
      </form>`, "form");

    const f = $("#appForm");
    const regionHint = () => { const r = JL.detectRegion(f.location.value); $("#regionHint").textContent = f.location.value ? "Region: " + r : ""; };
    const dupCheck = () => {
      const d = JL.findDuplicate(Store.apps, { id: a.id, company: f.company.value, title: f.title.value });
      const w = $("#dupWarn"); w.hidden = !d;
      if (d) w.textContent = `You already applied for this role on ${JL.fmtDate(d.dateApplied)}.`;
    };
    f.url.addEventListener("change", () => {
      const ch = JL.detectChannel(f.url.value), th = JL.detectThrough(f.url.value);
      if (ch) f.channel.value = ch; if (th) f.appliedThrough.value = th;
    });
    f.location.addEventListener("input", regionHint); regionHint();
    f.company.addEventListener("input", dupCheck); f.title.addEventListener("input", dupCheck); dupCheck();
    f.status.addEventListener("change", () => { $("#ivField").hidden = f.status.value !== "Interview Scheduled"; });
    $("#cancelForm").onclick = () => existing ? renderDetail(existing, false) : closeSheet();

    f.addEventListener("submit", async e => {
      e.preventDefault();
      if (!f.company.value.trim() || !f.title.value.trim()) { toast("Company and job title are needed"); (f.company.value.trim() ? f.title : f.company).focus(); return; }
      const prevStatus = existing ? existing.status : null;
      ["url", "company", "title", "location", "channel", "appliedThrough", "dateApplied", "type", "salary", "status", "interviewDate", "contact", "nextAction"].forEach(k => a[k] = f[k].value.trim());
      a.notes = JL.redact(f.notes.value.trim());
      if (!existing) a.history = [{ status: a.status === "Applied" ? "Applied" : "Applied", date: a.dateApplied }].concat(a.status !== "Applied" ? [{ status: a.status, date: JL.today() }] : []);
      else if (prevStatus !== a.status) a.history = (a.history || []).concat({ status: a.status, date: JL.today() });
      try {
        await Store.save(a);
        state.firstHomeRender = true;
        state.openId = a.id;
        renderDetail(Store.apps.find(x => x.id === a.id) || a, true);
        toast(existing ? "Changes saved" : "Application added");
      } catch (err) { toast(err.message); }
    });
    if (!existing) setTimeout(() => f.url.focus(), 350);
  }
  $("#fab").addEventListener("click", () => renderForm(null));

  /* ---------------- boot ---------------- */
  applyTheme();
  Store.onChange(render);
  window.addEventListener("resize", (() => { let t, lastW = innerWidth; return () => { clearTimeout(t); t = setTimeout(() => { if (innerWidth === lastW) return; lastW = innerWidth; if (state.view === "home") { const st = JL.computeStats(Store.apps, Store.settings); Charts.channel(st.perChannel); Charts.line($("#transitLine"), { counts: st.atStation, reached: st.reached }); } }, 250); }; })());
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (Store.settings.theme === "auto") { Charts.destroyAll(); render(); } });

  const initial = location.hash.slice(1) || "home";
  history.replaceState({ view: initial }, "", "#" + initial);
  go(initial, false);
  Store.init().then(() => { state.firstHomeRender = true; go(state.view, false); });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline support unavailable */ });
  }
  window.addEventListener("online", () => { if (Store.mode === "github" && !Store.dirty) Store.loadPublished().catch(() => {}); });
})();
