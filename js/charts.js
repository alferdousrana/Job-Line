/* ==========================================================
   Job Line — charts (Chart.js) and the transit-line pipeline
   ========================================================== */
(function () {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const charts = {};
  const SVGNS = "http://www.w3.org/2000/svg";
  const FONT = "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";

  const palette = () => ({
    tide: css("--tide"), sky: css("--sky"), pandan: css("--pandan"), gold: css("--gold"),
    hibiscus: css("--hibiscus"), mute: css("--mute"), ink: css("--ink"), line: css("--line"), surface: css("--surface")
  });

  function baseOptions() {
    const p = palette();
    return {
      responsive: true, maintainAspectRatio: false,
      animation: reduce ? false : { duration: 900, easing: "easeOutQuart" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: p.ink, titleColor: p.surface, bodyColor: p.surface,
          padding: 10, cornerRadius: 8, displayColors: false,
          titleFont: { family: FONT, weight: "600" }, bodyFont: { family: FONT }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: p.mute, font: { family: FONT, size: 11 }, maxRotation: 0, autoSkipPadding: 12 } },
        y: { beginAtZero: true, grid: { color: p.line }, border: { display: false }, ticks: { color: p.mute, precision: 0, font: { family: FONT, size: 11 } } }
      }
    };
  }

  function upsert(id, config) {
    const el = document.getElementById(id);
    if (!el || !window.Chart) return;
    if (charts[id]) {
      charts[id].data = config.data;
      charts[id].options = config.options;
      charts[id].update();
      return;
    }
    charts[id] = new Chart(el, config);
  }

  function destroyAll() { Object.keys(charts).forEach(k => { charts[k].destroy(); delete charts[k]; }); }

  const Charts = {
    destroyAll,

    daily(series) {
      const p = palette();
      const max = Math.max(1, ...series.values);
      upsert("dailyChart", {
        type: "bar",
        data: { labels: series.labels, datasets: [{
          data: series.values, borderRadius: 5, borderSkipped: false, maxBarThickness: 22,
          backgroundColor: series.values.map(v => (v === max && v > 0 ? p.gold : p.tide))
        }] },
        options: Object.assign(baseOptions(), {})
      });
    },

    channel(perChannel) {
      const p = palette();
      const entries = Object.entries(perChannel).sort((a, b) => b[1].apps - a[1].apps);
      const colors = [p.tide, p.pandan, p.gold, p.hibiscus, p.sky, p.mute, p.ink];
      const o = baseOptions(); delete o.scales;
      o.cutout = "68%";
      o.plugins.legend = { display: true, position: "right", labels: { color: p.ink, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle", font: { family: FONT, size: 12 } } };
      if (window.innerWidth < 520) o.plugins.legend.position = "bottom";
      upsert("channelChart", {
        type: "doughnut",
        data: { labels: entries.map(e => e[0]), datasets: [{ data: entries.map(e => e[1].apps), backgroundColor: colors, borderColor: p.surface, borderWidth: 3, hoverOffset: 6 }] },
        options: o
      });
    },

    status(byStatus, order) {
      const p = palette();
      const tone = s => p[window.JL.statusTone(s)] || p.tide;
      const labels = order.filter(s => byStatus[s]);
      const o = baseOptions(); o.indexAxis = "y";
      o.scales.y.grid = { display: false }; o.scales.x.grid = { color: p.line }; o.scales.x.ticks.precision = 0; o.scales.x.beginAtZero = true;
      upsert("statusChart", {
        type: "bar",
        data: { labels, datasets: [{ data: labels.map(s => byStatus[s]), backgroundColor: labels.map(tone), borderRadius: 5, maxBarThickness: 20 }] },
        options: o
      });
    },

    region(byRegion) {
      const p = palette();
      const e = Object.entries(byRegion).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const o = baseOptions(); o.indexAxis = "y";
      o.scales.y.grid = { display: false }; o.scales.x.grid = { color: p.line }; o.scales.x.beginAtZero = true; o.scales.x.ticks.precision = 0;
      upsert("regionChart", {
        type: "bar",
        data: { labels: e.map(x => x[0]), datasets: [{ data: e.map(x => x[1]), backgroundColor: p.pandan, borderRadius: 5, maxBarThickness: 18 }] },
        options: o
      });
    },

    weekly(series) {
      const p = palette();
      upsert("weeklyChart", {
        type: "line",
        data: { labels: series.labels, datasets: [{
          data: series.values, borderColor: p.tide, borderWidth: 2.5, tension: 0.35, fill: true,
          backgroundColor: ctx => {
            const { chart } = ctx; const { ctx: c, chartArea } = chart;
            if (!chartArea) return "transparent";
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
            g.addColorStop(0, p.tide + "55"); g.addColorStop(1, p.tide + "00");
            return g;
          },
          pointBackgroundColor: p.surface, pointBorderColor: p.tide, pointBorderWidth: 2, pointRadius: 3.5, pointHoverRadius: 6
        }] },
        options: baseOptions()
      });
    },

    /* ---------- transit line ----------
       opts: { counts:[4], reached:[4], current:-1|index, mini:bool, animate:bool } */
    line(container, opts) {
      const S = window.JL.STATIONS;
      const mini = !!opts.mini;
      const W = Math.max(300, Math.min(1100, Math.round(container.getBoundingClientRect().width) || 360)), H = mini ? 92 : 150;
      const padX = 30, y = mini ? 44 : 78;
      const xs = S.map((_, i) => padX + i * ((W - padX * 2) / (S.length - 1)));
      const furthest = opts.current != null && opts.current >= 0 ? opts.current
        : Math.max(0, ...opts.reached.map((r, i) => (r > 0 ? i : 0)));
      const animate = opts.animate && !reduce;

      const svg = document.createElementNS(SVGNS, "svg");
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("class", "tline" + (mini ? " mini" : "") + (animate ? " animate" : ""));
      const add = (tag, attrs, parent = svg) => { const el = document.createElementNS(SVGNS, tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); parent.appendChild(el); return el; };

      // track (full line, faint) and travelled part (coloured segments)
      add("line", { x1: xs[0], y1: y, x2: xs[xs.length - 1], y2: y, class: "tl-track" });
      for (let i = 0; i < S.length - 1; i++) {
        const seg = add("line", { x1: xs[i], y1: y, x2: xs[i + 1], y2: y, class: "tl-seg" + (i < furthest ? " on" : ""), style: `--c:${S[i + 1].color};--d:${i * 0.28}s` });
        seg.style.setProperty("--len", xs[i + 1] - xs[i]);
      }

      // moving trains: run along the travelled part and on toward the next station
      // (applications still waiting for a reply are "in transit")
      const waiting = opts.current != null ? (opts.current >= 0 && opts.current < S.length - 1 ? 1 : 0)
        : opts.counts.slice(0, S.length - 1).reduce((a, b) => a + b, 0);
      const endIdx = Math.min(S.length - 1, furthest + (waiting ? 1 : 0));
      if (!reduce && endIdx > 0 && !(mini && opts.current == null)) {
        const x0 = xs[0], xEnd = mini && opts.current != null ? xs[Math.max(0, opts.current)] : xs[endIdx];
        const path = `M${x0},${y} L${xEnd},${y}`;
        const total = opts.counts.reduce((a, b) => a + b, 0);
        const trains = mini ? 1 : Math.min(4, Math.max(1, Math.round(total / 12)));
        const dur = mini ? 0.9 + Math.max(0, opts.current) * 0.45 : 3 + endIdx * 0.8;
        for (let t = 0; t < trains; t++) {
          const c = add("circle", { r: mini ? 3.6 : 4.2, class: "tl-train", opacity: 0 });
          const begin = mini ? 0.25 : 1.4 + t * (dur / trains);
          add("animateMotion", { dur: dur + "s", repeatCount: mini ? "1" : "indefinite", path, begin: begin + "s", fill: "freeze", calcMode: "spline", keyTimes: "0;1", keySplines: "0.45 0 0.25 1" }, c);
          add("animate", { attributeName: "opacity", values: mini ? "0;1;1" : "0;1;1;0", keyTimes: mini ? "0;0.15;1" : "0;0.1;0.8;1", dur: dur + "s", begin: begin + "s", repeatCount: mini ? "1" : "indefinite", fill: "freeze" }, c);
        }
        if (mini && opts.current <= 0) svg.querySelectorAll(".tl-train").forEach(n => n.remove());
      }

      // stations
      S.forEach((st, i) => {
        const g = add("g", { class: "tl-station" + (i <= furthest ? " reached" : "") + (opts.current === i ? " current" : ""), style: `--c:${st.color};--d:${0.15 + i * 0.28}s` });
        if (opts.current === i) add("circle", { cx: xs[i], cy: y, r: 14, class: "tl-pulse" }, g);
        add("circle", { cx: xs[i], cy: y, r: mini ? 7.5 : 9.5, class: "tl-dot" }, g);
        const lab = add("text", { x: xs[i], y: y + (mini ? 26 : 32), class: "tl-label", "text-anchor": "middle" }, g);
        lab.textContent = st.label;
        if (!mini) {
          const n = add("text", { x: xs[i], y: y - 22, class: "tl-count", "text-anchor": "middle", "data-target": opts.counts[i] }, g);
          n.textContent = animate ? "0" : opts.counts[i];
          const sub = add("text", { x: xs[i], y: y + 48, class: "tl-sub", "text-anchor": "middle" }, g);
          sub.textContent = i === 0 ? `${opts.reached[i]} sent` : `${opts.reached[i]} reached`;
        }
      });

      container.replaceChildren(svg);
      if (animate) {
        svg.querySelectorAll(".tl-count").forEach((el, i) => countUp(el, +el.dataset.target, 700, 300 + i * 280));
      }
    }
  };

  function countUp(el, target, dur = 800, delay = 0) {
    if (reduce || !target) { el.textContent = target; return; }
    const start = performance.now() + delay;
    const step = now => {
      const t = Math.min(1, Math.max(0, (now - start) / dur));
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(target * e);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  Charts.countUp = countUp;

  window.JLCharts = Charts;
})();
