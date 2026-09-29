/* ==========================================================
   Job Line — logic & automation (no DOM here)
   ========================================================== */
(function () {
  const CFG = window.JOBLINE_CONFIG;

  // ---------- dates ----------
  const pad = n => String(n).padStart(2, "0");
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => toISO(new Date());
  const parseISO = s => {
    if (!s) return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  const daysAgo = s => (s ? daysBetween(s, today()) : 0);
  const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); };
  const fmtDate = s => {
    const d = parseISO(s);
    return d ? d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "—";
  };
  const fmtShort = s => {
    const d = parseISO(s);
    return d ? d.toLocaleDateString("en-MY", { day: "numeric", month: "short" }) : "";
  };
  const relDays = n => (n <= 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`);

  // ---------- stages ----------
  // The main line. Application Pending sits at the Applied station.
  const STATIONS = [
    { key: "applied",   label: "Applied",    statuses: ["Applied", "Application Pending"], color: "var(--tide)" },
    { key: "screening", label: "Screening",  statuses: ["Screening"],                      color: "var(--sky)" },
    { key: "interview", label: "Interview",  statuses: ["Interview Scheduled"],            color: "var(--pandan)" },
    { key: "offer",     label: "Offer",      statuses: ["Offer Received"],                 color: "var(--gold)" }
  ];
  const EXIT_STATUSES = ["Rejected", "Withdrawn"];
  const stageIndex = status => STATIONS.findIndex(s => s.statuses.includes(status));
  // Furthest station ever reached (uses history, so a rejection after interview still counts as "reached interview").
  const furthestStage = app => {
    let max = stageIndex(app.status);
    (app.history || []).forEach(h => { max = Math.max(max, stageIndex(h.status)); });
    return Math.max(max, 0);
  };
  const isOpen = app => !EXIT_STATUSES.includes(app.status) && app.status !== "Offer Received";
  const isWaiting = app => ["Applied", "Application Pending"].includes(app.status);
  const lastMove = app => {
    const h = app.history || [];
    return (h.length ? h[h.length - 1].date : app.dateApplied) || app.dateApplied;
  };
  const lastTouch = app => {
    const f = (app.followUps || []).slice(-1)[0];
    const m = lastMove(app);
    return f && f > m ? f : m;
  };

  const statusTone = s => ({
    "Applied": "tide", "Application Pending": "tide", "Screening": "sky",
    "Interview Scheduled": "pandan", "Offer Received": "gold",
    "Rejected": "hibiscus", "Withdrawn": "mute"
  }[s] || "tide");

  // ---------- region detection (Malaysia) ----------
  const REGION_RULES = [
    ["Remote", /remote|work from home|wfh/i],
    ["Kuala Lumpur", /kuala lumpur|\bkl\b|mont kiara|bukit jalil|kuchai|kepong|bukit ceylon|\boug\b|bangsar|cheras|setapak|wangsa|klcc|bukit bintang|sri hartamas|kerinchi|mid valley|federal territory/i],
    ["Selangor", /selangor|petaling|\bpj\b|subang|shah alam|klang|cyberjaya|puchong|kelana|damansara|tropicana|puncak|rawang|kajang|bangi|seri kembangan|sunway|ara damansara|serdang|sepang/i],
    ["Putrajaya", /putrajaya/i],
    ["Penang", /penang|pulau pinang|george ?town|seberang|bayan lepas|butterworth/i],
    ["Johor", /johor|\bjb\b|iskandar|skudai|kulai|batu pahat|muar/i],
    ["Sabah", /sabah|kota kinabalu|sandakan|tawau/i],
    ["Sarawak", /sarawak|kuching|miri|sibu|bintulu/i],
    ["Perak", /perak|ipoh/i],
    ["Melaka", /melaka|malacca/i],
    ["Negeri Sembilan", /negeri sembilan|seremban|nilai/i],
    ["Pahang", /pahang|kuantan/i],
    ["Kedah", /kedah|alor setar|kulim/i],
    ["Kelantan", /kelantan|kota bharu/i],
    ["Terengganu", /terengganu/i],
    ["Regional / APAC", /apac|asia pacific|japac|sea\b|regional/i],
    ["Malaysia (other)", /malaysia/i]
  ];
  const detectRegion = loc => {
    if (!loc || !loc.trim()) return "Not stated";
    for (const [name, re] of REGION_RULES) if (re.test(loc)) return name;
    return "Other";
  };

  // ---------- channel detection from a job URL ----------
  const detectChannel = url => {
    if (!url) return "";
    if (/linkedin\./i.test(url)) return "LinkedIn";
    if (/jobstreet\./i.test(url)) return "JobStreet";
    if (/hiredly\./i.test(url)) return "HIREDLY";
    if (/google\.[^/]+\/.*jobs|careers\.google/i.test(url)) return "Google Jobs";
    if (/facebook\./i.test(url)) return "Facebook";
    if (/maukerja|ricebowl|indeed/i.test(url)) return "Maukerja / Other";
    return "Find Compnay Website";
  };
  const detectThrough = url => {
    if (!url) return "";
    if (/linkedin\./i.test(url)) return "LinkedIn";
    if (/jobstreet\./i.test(url)) return "Jobstreet";
    if (/hiredly\./i.test(url)) return "HIREDLY";
    if (/michaelpage/i.test(url)) return "Michael Page";
    return "Website";
  };

  // ---------- salary ----------
  // "8000", "RM 5K - RM 13K", "RM 6000 - RM 7000", "Undisclosed"
  const parseSalary = s => {
    if (s === null || s === undefined || s === "") return null;
    const txt = String(s).replace(/,/g, "");
    const nums = [...txt.matchAll(/(\d+(?:\.\d+)?)\s*(k)?/gi)].map(m => parseFloat(m[1]) * (m[2] ? 1000 : 1)).filter(n => n >= 500);
    if (!nums.length) return null;
    const min = Math.min(...nums), max = Math.max(...nums);
    return { min, max, mid: (min + max) / 2 };
  };
  const fmtRM = n => "RM " + Math.round(n).toLocaleString("en-MY");

  // ---------- privacy ----------
  const redact = txt => {
    if (!txt) return "";
    if (/pass(word)?\s*[:=]/i.test(txt) || /\bpwd\s*[:=]/i.test(txt)) {
      return "Portal account created (login details removed — keep them in a password manager).";
    }
    return txt;
  };

  // ---------- automation: next action ----------
  const suggestNext = (app, rules) => {
    if (app.nextAction) return app.nextAction;
    const age = daysAgo(lastTouch(app));
    switch (app.status) {
      case "Applied":
      case "Application Pending":
        return age >= rules.followUpAfterDays
          ? "Send a polite follow-up to the recruiter"
          : `Follow up on ${fmtShort(addDays(lastTouch(app), rules.followUpAfterDays))}`;
      case "Screening": return "Prepare answers for the screening call";
      case "Interview Scheduled":
        return app.interviewDate ? `Interview on ${fmtShort(app.interviewDate)} — research the company` : "Confirm the interview date";
      case "Offer Received": return "Review the offer and negotiate salary";
      case "Rejected": return "Ask for feedback, then move on";
      default: return "";
    }
  };

  // ---------- automation: attention list ----------
  const attentionItems = (apps, rules) => {
    const out = [];
    const t = today();
    apps.forEach(a => {
      if (a.status === "Interview Scheduled" && a.interviewDate) {
        const d = daysBetween(t, a.interviewDate);
        if (d >= 0 && d <= 7) out.push({ app: a, kind: "interview", weight: 100 - d, text: d === 0 ? "Interview today" : `Interview in ${d} day${d > 1 ? "s" : ""}` });
      }
      if (a.status === "Interview Scheduled" && !a.interviewDate) out.push({ app: a, kind: "interview", weight: 80, text: "Add the interview date" });
      if (a.status === "Offer Received") out.push({ app: a, kind: "offer", weight: 95, text: "Offer waiting for your answer" });
      if (isWaiting(a)) {
        const age = daysAgo(lastTouch(a));
        if (age >= rules.staleAfterDays) out.push({ app: a, kind: "stale", weight: 20, text: `No reply in ${age} days — withdraw or chase` });
        else if (age >= rules.followUpAfterDays) out.push({ app: a, kind: "follow", weight: 40 + age, text: `Follow-up due · ${age} days quiet` });
      }
    });
    return out.sort((x, y) => y.weight - x.weight);
  };

  // ---------- stats ----------
  const countBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x) || "Not stated"; m[k] = (m[k] || 0) + 1; return m; }, {});

  const computeStats = (apps, rules) => {
    const total = apps.length;
    const atStation = STATIONS.map(s => apps.filter(a => s.statuses.includes(a.status)).length);
    const reached = STATIONS.map((s, i) => apps.filter(a => furthestStage(a) >= i).length);
    const rejected = apps.filter(a => a.status === "Rejected").length;
    const withdrawn = apps.filter(a => a.status === "Withdrawn").length;
    const quiet = apps.filter(a => isWaiting(a) && daysAgo(lastTouch(a)) >= rules.staleAfterDays).length;
    const active = apps.filter(a => ["Applied", "Application Pending", "Screening", "Interview Scheduled"].includes(a.status)).length;
    const interviews = reached[2];
    const offers = reached[3];
    const replied = apps.filter(a => furthestStage(a) >= 1 || a.status === "Rejected").length;

    const month = today().slice(0, 7);
    const thisMonth = apps.filter(a => (a.dateApplied || "").startsWith(month)).length;

    // streak of consecutive days with at least one application, ending today or yesterday
    const days = new Set(apps.map(a => a.dateApplied).filter(Boolean));
    let streak = 0, cursor = today();
    if (!days.has(cursor)) cursor = addDays(cursor, -1);
    while (days.has(cursor)) { streak++; cursor = addDays(cursor, -1); }

    const perChannel = {};
    apps.forEach(a => {
      const c = a.channel || "Not stated";
      perChannel[c] = perChannel[c] || { apps: 0, replies: 0, interviews: 0, offers: 0 };
      const f = furthestStage(a);
      perChannel[c].apps++;
      if (f >= 1 || a.status === "Rejected") perChannel[c].replies++;
      if (f >= 2) perChannel[c].interviews++;
      if (f >= 3) perChannel[c].offers++;
    });

    const salaries = apps.map(a => parseSalary(a.salary)).filter(Boolean);
    return {
      total, active, interviews, offers, rejected, withdrawn, quiet, replied,
      atStation, reached, thisMonth, streak, perChannel, salaries,
      byStatus: countBy(apps, a => a.status),
      byRegion: countBy(apps, a => detectRegion(a.location)),
      byThrough: countBy(apps, a => a.appliedThrough),
      replyRate: total ? replied / total : 0,
      interviewRate: total ? interviews / total : 0
    };
  };

  const dailySeries = (apps, range) => {
    const labels = [], values = [];
    const counts = countBy(apps, a => a.dateApplied);
    for (let i = range - 1; i >= 0; i--) {
      const d = addDays(today(), -i);
      labels.push(fmtShort(d));
      values.push(counts[d] || 0);
    }
    return { labels, values };
  };

  const weeklySeries = (apps, weeks = 10) => {
    const monday = s => { const d = parseISO(s); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return toISO(d); };
    const start = monday(today());
    const labels = [], values = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const w = addDays(start, -7 * i);
      labels.push(fmtShort(w));
      values.push(apps.filter(a => a.dateApplied && monday(a.dateApplied) === w).length);
    }
    return { labels, values };
  };

  const topRoles = apps => {
    const words = {};
    const STOP = /^(and|of|the|for|in|&|-|–|\/|a|to|with|manager|executive|senior|assistant|specialist|lead|head|associate|malaysia|group)$/i;
    const phrases = ["business development", "partnership", "sales", "healthcare", "medical", "lecturer", "product", "account", "marketing", "clinical", "strategic", "growth", "relationship", "digital"];
    apps.forEach(a => {
      const t = (a.title || "").toLowerCase();
      phrases.forEach(p => { if (t.includes(p)) words[p] = (words[p] || 0) + 1; });
    });
    return Object.entries(words).filter(([w]) => !STOP.test(w)).sort((a, b) => b[1] - a[1]);
  };

  const findDuplicate = (apps, draft) => {
    const norm = s => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
    return apps.find(a => a.id !== draft.id && norm(a.company) === norm(draft.company) && norm(a.title) === norm(draft.title));
  };

  const uid = () => "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- Excel <-> app objects ----------
  const EXCEL_HEADERS = ["Company Name", "Job Title", "Location (Malaysia)", "Channel / Source", "Date Applied", "Employment Type", "Expected Salary (MYR)", "Application Status", "Applied Through", "Recruiter / Contact", "Job Posting URL", "Notes & Stage Details", "Next Action"];

  const excelDate = v => {
    if (v instanceof Date) return toISO(v);
    if (typeof v === "number") { const d = new Date(Math.round((v - 25569) * 86400000)); return toISO(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
    if (typeof v === "string") { const d = new Date(v); if (!isNaN(d)) return toISO(d); }
    return "";
  };
  const clean = v => (v === null || v === undefined ? "" : String(v).replace(/\r/g, "").replace(/[ \t]+/g, " ").trim());

  // rows: array of arrays (sheet_to_json header:1). Finds the header row automatically.
  const rowsToApps = rows => {
    const hi = rows.findIndex(r => r && r.some(c => clean(c) === "Company Name"));
    if (hi < 0) throw new Error("Could not find the 'Company Name' header row in this sheet.");
    const head = rows[hi].map(clean);
    const col = name => head.indexOf(name);
    const idx = EXCEL_HEADERS.map(col);
    const apps = [];
    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const get = i => (idx[i] >= 0 ? row[idx[i]] : "");
      const company = clean(get(0));
      if (!company) continue;
      const date = excelDate(get(4)) || today();
      const status = clean(get(7)) || "Applied";
      let nextAction = clean(get(12)), notes = redact(clean(get(11)));
      if (/^https?:/.test(nextAction)) { notes = (notes ? notes + "\n" : "") + "Job post: " + nextAction; nextAction = ""; }
      apps.push({
        id: uid() + r, company, title: clean(get(1)), location: clean(get(2)), channel: clean(get(3)),
        dateApplied: date, type: clean(get(5)) || "Full-time", salary: clean(get(6)), status,
        appliedThrough: clean(get(8)), contact: clean(get(9)), url: clean(get(10)), notes, nextAction,
        interviewDate: "", history: [{ status, date }], followUps: [], updatedAt: date
      });
    }
    return apps;
  };

  const appsToRows = apps => [EXCEL_HEADERS].concat(apps.map(a => [
    a.company, a.title, a.location, a.channel, a.dateApplied, a.type, a.salary, a.status,
    a.appliedThrough, a.contact, a.url, a.notes, a.nextAction
  ]));

  window.JL = {
    CFG, STATIONS, EXIT_STATUSES, today, addDays, daysAgo, daysBetween, fmtDate, fmtShort, relDays,
    stageIndex, furthestStage, isOpen, isWaiting, lastMove, lastTouch, statusTone,
    detectRegion, detectChannel, detectThrough, parseSalary, fmtRM, redact,
    suggestNext, attentionItems, computeStats, dailySeries, weeklySeries, topRoles,
    findDuplicate, uid, rowsToApps, appsToRows, countBy
  };
})();
