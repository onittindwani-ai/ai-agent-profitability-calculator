/*
 * AI Agent Profitability Calculator: the interface.
 * All math lives in engine.js (window.ProfitEngine). This file only renders,
 * edits and saves. No network calls. Data stays in this browser.
 */
(function () {
  "use strict";

  var E = window.ProfitEngine;
  var STORAGE_KEY = "ai-agent-profitability-calculator.v1";
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var BUSY_MS = REDUCED ? 0 : 560;

  var SECTIONS = [
    {
      n: 1, key: "agent", title: "Agent costs", desc: "What the AI model, automation and tools cost each month",
      total: "agent_costs",
      fields: [
        { key: "runs_monthly", label: "Runs per month", kind: "number" },
        { key: "agent_calls_per_run", label: "Agent calls per run", kind: "number" },
        { key: "input_tokens_per_call", label: "Input tokens per call", kind: "number" },
        { key: "output_tokens_per_call", label: "Output tokens per call", kind: "number" },
        { key: "price_input_per_million", label: "Input price per 1M tokens", kind: "money" },
        { key: "price_output_per_million", label: "Output price per 1M tokens", kind: "money" },
        { key: "model_cost_override", label: "Model bill override (optional)", kind: "optionalMoney", placeholder: "Use estimate" },
        { key: "infrastructure_monthly", label: "Automation and hosting per month", kind: "money" },
        { key: "tools_monthly", label: "Other tools per month", kind: "money" }
      ],
      readouts: [
        { out: "tokens_monthly", label: "Tokens per month", fmt: "tokens" },
        { out: "model_base", label: "AI model cost", fmt: "money" },
        { out: "model_cost", label: "With retries", fmt: "money" },
        { out: "agent_costs", label: "Agent costs total", fmt: "money", total: true }
      ],
      note: "Token prices are example rates. Replace them with your provider's current price per 1M tokens. If you know your real monthly model bill for this workflow, put it in the override and the estimate is ignored."
    },
    {
      n: 2, key: "hidden", title: "Hidden costs", desc: "Retries and the people who check and fix the work",
      total: "hidden_costs",
      fields: [
        { key: "retry_rate", label: "Runs that need a retry", kind: "percent" },
        { key: "review_hours", label: "Review hours per month", kind: "hours" },
        { key: "maintenance_hours", label: "Upkeep hours per month", kind: "hours" },
        { key: "hourly_rate", label: "Hourly rate", kind: "money" }
      ],
      toggle: { key: "rule_based", label: "This is a fixed rule workflow", sub: "Turn on if every step follows a set rule and needs no judgement." },
      readouts: [
        { out: "retry_cost", label: "Retry cost", fmt: "money" },
        { out: "review_cost", label: "Review cost", fmt: "money" },
        { out: "maintenance_cost", label: "Upkeep cost", fmt: "money" },
        { out: "hidden_costs", label: "Hidden costs total", fmt: "money", total: true }
      ]
    },
    {
      n: 3, key: "outcomes", title: "Cost per outcome", desc: "What one lead, meeting or reply really costs you",
      total: "cost_per_run", totalSuffix: " per run",
      outcomes: true,
      readouts: [
        { out: "cost_per_run", label: "Cost per run", fmt: "money" },
        { out: "total_outcomes", label: "Outcomes per month", fmt: "int" },
        { out: "delivery_cost", label: "Delivery cost", fmt: "money" },
        { out: "revenue_monthly", label: "Client pays", fmt: "money", total: true }
      ]
    },
    {
      n: 4, key: "profit", title: "Profit and pricing", desc: "What you keep, and the price that hits your target",
      total: "gross_profit",
      fields: [{ key: "revenue_monthly", label: "Client pays per month", kind: "money" }],
      costbar: true,
      readouts: [
        { out: "delivery_cost", label: "Delivery cost", fmt: "money" },
        { out: "gross_profit", label: "Gross profit", fmt: "money", total: true, tone: "profit" },
        { out: "gross_margin", label: "Gross margin", fmt: "percent", tone: "status" },
        { out: "model_share", label: "Model share of cost", fmt: "percent" },
        { out: "break_even_price", label: "Break even price", fmt: "money" },
        { out: "price_for_target", label: "Price for target margin", fmt: "money", dynamicLabel: "target", total: true },
        { out: "cost_per_run", label: "Cost per run", fmt: "money" },
        { out: "model_cost", label: "AI model per month", fmt: "money" }
      ]
    },
    { n: 5, key: "recs", title: "Recommendations", desc: "What to fix first, worked out from your numbers", recs: true }
  ];

  var STATUS_LABEL = { green: "Healthy", amber: "Below target", red: "Under warning line" };

  // ---------- state ----------

  var state = {
    data: null,
    portfolio: null,
    selectedId: null,
    open: { 1: true, 2: false, 3: false, 4: true, 5: true },
    storageOk: true,
    lastRecsKey: ""
  };

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(text) {
    return String(text === null || text === undefined ? "" : text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function money(v) { return E.formatMoney(v, state.data.currency); }
  function pct(v) { return E.formatPercent(v); }
  function settingPct(v) { var whole = Math.round(v * 1000) % 10 === 0; return E.formatPercent(v, whole ? 0 : 1); }
  function tokens(v) {
    if (typeof v !== "number" || !isFinite(v)) return "n/a";
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    if (v >= 1e4) return (v / 1e3).toFixed(1) + "K";
    return E.formatNumber(v, 0);
  }
  function fmt(kind, v) {
    if (kind === "money") return money(v);
    if (kind === "percent") return pct(v);
    if (kind === "tokens") return tokens(v);
    if (kind === "int") return E.formatNumber(v, v % 1 ? 1 : 0);
    return String(v);
  }

  // ---------- storage (wrapped, the app works without it) ----------

  function loadSaved() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.data || !Array.isArray(parsed.data.workflows)) return null;
      return parsed;
    } catch (err) {
      state.storageOk = probeStorage();
      return null;
    }
  }
  function probeStorage() {
    try {
      var k = STORAGE_KEY + ".probe";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return true;
    } catch (err) {
      return false;
    }
  }
  function saveNow() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ data: state.data, ui: { selectedId: state.selectedId, open: state.open } }));
      state.storageOk = true;
    } catch (err) {
      state.storageOk = false;
    }
    updatePrivacyNote();
    flashSaved();
    return state.storageOk;
  }
  var saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 450);
  }

  function updatePrivacyNote() {
    var note = $("#privacy-note");
    var text = $("#privacy-text");
    if (state.storageOk) {
      note.classList.remove("is-warn");
      text.textContent = "Everything stays on this device";
    } else {
      note.classList.add("is-warn");
      text.textContent = "Stays on this device. Saving is blocked here, so export to keep your work";
    }
  }

  // ---------- data changes (each returns a new data object) ----------

  function setData(next) {
    state.data = E.normalizeData(next);
    state.portfolio = E.computePortfolio(state.data);
    if (!findWorkflow(state.selectedId)) {
      state.selectedId = state.data.workflows.length ? state.data.workflows[0].id : null;
    }
  }
  function findWorkflow(id) {
    return state.data.workflows.filter(function (w) { return w.id === id; })[0] || null;
  }
  function findResult(id) {
    return state.portfolio.workflows.filter(function (r) { return r.id === id; })[0] || null;
  }
  function withWorkflow(id, patch) {
    var data = state.data;
    return Object.assign({}, data, {
      workflows: data.workflows.map(function (w) { return w.id === id ? Object.assign({}, w, patch) : w; })
    });
  }
  function uniqueId(base) {
    var ids = state.data.workflows.map(function (w) { return w.id; });
    var id = base;
    var n = 2;
    while (ids.indexOf(id) !== -1) { id = base + "-" + n; n += 1; }
    return id;
  }

  // ---------- small visual helpers ----------

  var R = 42;
  var C = 2 * Math.PI * R;
  function ringMarkup(extraClass, strokeWidth, labelHtml) {
    return (
      '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle class="track" cx="50" cy="50" r="' + R + '" stroke-width="' + strokeWidth + '"></circle>' +
      '<circle class="arc" cx="50" cy="50" r="' + R + '" stroke-width="' + strokeWidth + '" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + C.toFixed(2) + '"></circle>' +
      "</svg>" + '<div class="ring-label">' + (labelHtml || "") + "</div>"
    );
  }
  function setRing(el, fraction, status, label) {
    if (!el) return;
    var f = typeof fraction === "number" && isFinite(fraction) ? Math.max(0, Math.min(1, fraction)) : 0;
    var arc = $(".arc", el);
    el.setAttribute("data-status", status);
    el.classList.toggle("is-alarm", status === "red");
    if (label) el.setAttribute("aria-label", label);
    var apply = function () { if (arc) arc.style.strokeDashoffset = (C * (1 - f)).toFixed(2); };
    if (el._ready) apply();
    else { el._ready = true; requestAnimationFrame(function () { requestAnimationFrame(apply); }); }
  }

  function animateNumber(el, value, kind, opts) {
    if (!el) return;
    var o = opts || {};
    if (typeof value !== "number" || !isFinite(value)) {
      cancelAnimationFrame(el._raf);
      el._v = undefined;
      el.textContent = "n/a";
      return;
    }
    var from = typeof el._v === "number" ? el._v : o.fromZero === false ? value : 0;
    el._v = value;
    if (REDUCED || from === value) { el.textContent = fmt(kind, value); return; }
    var dur = o.duration || (el._seen ? 420 : 900);
    el._seen = true;
    var start = performance.now();
    cancelAnimationFrame(el._raf);
    var step = function (now) {
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(kind, from + (value - from) * eased);
      if (t < 1) el._raf = requestAnimationFrame(step);
      else el.textContent = fmt(kind, value);
    };
    el._raf = requestAnimationFrame(step);
  }

  var TICK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  function decorateButton(btn) {
    if (btn._decorated || btn.getAttribute("data-feedback") === "none") return;
    btn._decorated = true;
    var spin = document.createElement("span");
    spin.className = "btn-spinner";
    spin.setAttribute("aria-hidden", "true");
    var tick = document.createElement("span");
    tick.className = "btn-tick";
    tick.innerHTML = TICK_SVG;
    btn.appendChild(spin);
    btn.appendChild(tick);
  }

  /** Processing state, then the action, then a tick, then settle. */
  function withFeedback(btn, action) {
    if (btn && (btn.classList.contains("is-busy") || btn.classList.contains("is-done"))) return Promise.resolve();
    if (btn) { decorateButton(btn); btn.classList.add("is-busy"); btn.setAttribute("aria-busy", "true"); }
    return wait(BUSY_MS)
      .then(function () { return action(); })
      .then(function (result) {
        if (!btn) return result;
        btn.classList.remove("is-busy");
        btn.removeAttribute("aria-busy");
        if (result === false) return result;
        btn.classList.add("is-done");
        setTimeout(function () { btn.classList.remove("is-done"); }, REDUCED ? 600 : 1400);
        return result;
      })
      .catch(function (err) {
        if (btn) { btn.classList.remove("is-busy"); btn.removeAttribute("aria-busy"); }
        toast(err && err.userMessage ? err.userMessage : "Something went wrong. Nothing was changed.", { error: true });
      });
  }

  // press glow
  document.addEventListener("pointerdown", function (ev) {
    var btn = ev.target.closest && ev.target.closest(".btn");
    if (!btn) return;
    var r = btn.getBoundingClientRect();
    btn.style.setProperty("--press-x", ev.clientX - r.left + "px");
    btn.style.setProperty("--press-y", ev.clientY - r.top + "px");
    btn.classList.add("is-pressed");
    setTimeout(function () { btn.classList.remove("is-pressed"); }, 240);
  });

  // ---------- toasts ----------

  function toast(message, opts) {
    var o = opts || {};
    var host = $("#toasts");
    var el = document.createElement("div");
    el.className = "toast" + (o.error ? " is-error" : "");
    el.setAttribute("role", o.error ? "alert" : "status");
    el.innerHTML =
      '<span class="toast-icon">' + (o.error ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v6M12 17h.01"/></svg>' : TICK_SVG) + "</span>" +
      '<span class="toast-msg">' + esc(message) + "</span>";
    if (o.action) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = o.action.label;
      b.addEventListener("click", function () { o.action.run(); dismiss(); });
      el.appendChild(b);
    }
    host.appendChild(el);
    while (host.children.length > 3) host.removeChild(host.firstChild);
    var timer = setTimeout(dismiss, o.action ? 7000 : 3200);
    function dismiss() {
      clearTimeout(timer);
      if (!el.parentNode) return;
      el.classList.add("is-leaving");
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, REDUCED ? 0 : 240);
    }
    return el;
  }

  function undoable(label, snapshot) {
    return {
      label: "Undo",
      run: function () {
        state.selectedId = snapshot.selectedId;
        setData(snapshot.data);
        renderAll(true);
        saveNow();
        toast(label);
      }
    };
  }
  function snapshot() { return { data: clone(state.data), selectedId: state.selectedId }; }

  // ---------- dialogs ----------

  function confirmBox(title, text, okLabel) {
    var dlg = $("#confirm-dialog");
    $("#confirm-title").textContent = title;
    $("#confirm-text").textContent = text;
    $("#confirm-ok .btn-label").textContent = okLabel || "Confirm";
    if (typeof dlg.showModal !== "function") return Promise.resolve(window.confirm(title + "\n\n" + text));
    return new Promise(function (resolve) {
      dlg.returnValue = "";
      var onClose = function () { dlg.removeEventListener("close", onClose); resolve(dlg.returnValue === "ok"); };
      dlg.addEventListener("close", onClose);
      dlg.showModal();
    });
  }

  // ---------- summary ----------

  function renderSummary() {
    var p = state.portfolio;
    var n = state.data.workflows.length;
    animateNumber($("#sum-revenue"), p.total_revenue, "money");
    animateNumber($("#sum-delivery"), p.total_delivery_cost, "money");
    animateNumber($("#sum-profit"), p.total_gross_profit, "money");
    animateNumber($("#sum-margin"), p.portfolio_margin, "percent");
    $("#sum-revenue-sub").textContent = "per month across " + n + (n === 1 ? " workflow" : " workflows");
    $("#sum-margin-sub").textContent = "target " + settingPct(state.data.target_margin) + ", warning " + settingPct(state.data.warning_margin);
    var marginEl = $("#sum-margin");
    marginEl.classList.remove("is-red", "is-amber", "is-green");
    if (n) marginEl.classList.add("is-" + p.portfolio_status);

    var ring = $("#sum-ring");
    if (!ring.innerHTML) ring.innerHTML = ringMarkup("", 8, "");
    $(".ring-label", ring).innerHTML = n ? "<span>" + p.red_count + " of " + n + "<br>under " + settingPct(state.data.warning_margin) + "</span>" : "";
    setRing(ring, p.portfolio_margin, n ? p.portfolio_status : "green", "Portfolio margin " + pct(p.portfolio_margin));

    var insight = $("#insight");
    if (!n) { insight.innerHTML = "Add a workflow to see what it really earns you."; return; }
    var reds = p.workflows.filter(function (r) { return r.status === "red"; });
    var first = "Across " + n + (n === 1 ? " workflow" : " workflows") + " you keep <strong>" + esc(money(p.total_gross_profit)) + "</strong> of the <strong>" + esc(money(p.total_revenue)) + "</strong> you bill each month. ";
    var second;
    if (reds.length) {
      second = '<span class="is-red">' + reds.length + (reds.length === 1 ? " workflow is" : " workflows are") + " under your " + settingPct(state.data.warning_margin) + " warning line</span>: " +
        reds.map(function (r) { return esc(r.name); }).join(", ") + ".";
    } else if (p.most_profitable) {
      second = "Nothing is under your warning line. Your best margin is " + esc(p.most_profitable.name) + " at " + pct(p.most_profitable.gross_margin) + ".";
    } else {
      second = "";
    }
    insight.innerHTML = first + second;
  }

  // ---------- workflow list ----------

  function renderList() {
    var list = $("#workflow-list");
    var results = state.portfolio.workflows;
    $("#wf-count").textContent = results.length ? "(" + results.length + ")" : "";
    $("#empty-state").hidden = results.length > 0;
    var existing = {};
    $$(".wf-card", list).forEach(function (c) { existing[c.getAttribute("data-id")] = c.parentNode; });

    var frag = document.createDocumentFragment();
    results.forEach(function (r, i) {
      var li = existing[r.id];
      if (!li) {
        li = document.createElement("li");
        li.innerHTML =
          '<button type="button" class="wf-card" data-id="' + esc(r.id) + '" style="animation-delay:' + (REDUCED ? 0 : i * 50) + 'ms">' +
          '<div class="ring">' + ringMarkup("", 11, "") + "</div>" +
          '<div class="wf-main"><div class="wf-name"></div><div class="wf-client"></div><span class="chip"></span></div>' +
          '<div class="wf-meta"><div class="wf-profit"></div><div class="wf-profit-label">profit a month</div></div>' +
          "</button>";
      }
      var card = $(".wf-card", li);
      $(".wf-name", card).textContent = r.name || "Untitled workflow";
      $(".wf-client", card).textContent = r.client || "No client set";
      var chip = $(".chip", card);
      chip.className = "chip chip-" + r.status;
      chip.textContent = STATUS_LABEL[r.status];
      card.classList.toggle("is-red", r.status === "red");
      card.setAttribute("aria-current", r.id === state.selectedId ? "true" : "false");
      card.setAttribute("aria-label", (r.name || "Untitled workflow") + ", " + STATUS_LABEL[r.status] + ", margin " + pct(r.gross_margin) + ", profit " + money(r.gross_profit) + " a month");
      var ring = $(".ring", card);
      $(".ring-label", ring).textContent = r.gross_margin === null ? "n/a" : Math.round(r.gross_margin * 100) + "%";
      setRing(ring, r.gross_margin, r.status);
      animateNumber($(".wf-profit", card), r.gross_profit, "money");
      frag.appendChild(li);
    });
    list.innerHTML = "";
    list.appendChild(frag);
  }

  // ---------- editor ----------

  function inputValue(field, wf) {
    var v = wf[field.key];
    if (field.kind === "optionalMoney") return v === null || v === undefined ? "" : String(v);
    if (field.kind === "percent") return String(+(v * 100).toFixed(4));
    return String(v);
  }

  function fieldMarkup(field, wf) {
    var id = "f-" + field.key;
    var isMoney = field.kind === "money" || field.kind === "optionalMoney";
    var wrapClass = "input-wrap" + (isMoney ? " has-prefix" : "") + (field.kind === "percent" || field.kind === "hours" ? " has-suffix" : "");
    var prefix = isMoney ? '<span class="prefix">' + esc(E.currencySymbol(state.data.currency).trim()) + "</span>" : "";
    var suffix = field.kind === "percent" ? '<span class="suffix">%</span>' : field.kind === "hours" ? '<span class="suffix">h</span>' : "";
    return (
      '<div class="field" data-field="' + field.key + '">' +
      '<label for="' + id + '">' + esc(field.label) + "</label>" +
      '<div class="' + wrapClass + '">' + prefix +
      '<input id="' + id + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" data-key="' + field.key + '" data-kind="' + field.kind + '"' +
      ' value="' + esc(inputValue(field, wf)) + '"' + (field.placeholder ? ' placeholder="' + esc(field.placeholder) + '"' : "") +
      ' aria-describedby="' + id + '-err">' +
      '<span class="valid-tick" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>' +
      suffix + "</div>" +
      '<p class="error-text" id="' + id + '-err" hidden></p>' +
      "</div>"
    );
  }

  function readoutsMarkup(list) {
    return (
      '<div class="readouts">' +
      list.map(function (r) {
        var label = r.dynamicLabel === "target" ? "Price for " + settingPct(state.data.target_margin) + " margin" : r.label;
        return '<div class="readout' + (r.total ? " is-total" : "") + '"><p class="eyebrow">' + esc(label) + '</p><p class="val" data-out="' + r.out + '" data-fmt="' + r.fmt + '"' + (r.tone ? ' data-tone="' + r.tone + '"' : "") + ">0</p></div>";
      }).join("") +
      "</div>"
    );
  }

  function outcomesMarkup(wf) {
    var rows = wf.outcomes.map(function (o, i) {
      return (
        '<div class="outcome-row" data-index="' + i + '">' +
        '<div class="field"><input type="text" value="' + esc(o.name) + '" aria-label="Outcome ' + (i + 1) + ' name" data-oname="' + i + '" autocomplete="off"></div>' +
        '<div class="field"><input type="text" inputmode="numeric" value="' + esc(o.count) + '" aria-label="Outcome ' + (i + 1) + ' count per month" data-ocount="' + i + '" autocomplete="off"></div>' +
        '<div class="nums">' +
        '<span class="num" data-label="Cost each" data-oout="cost_per_outcome" data-oi="' + i + '"></span>' +
        '<span class="num" data-label="Revenue each" data-oout="revenue_per_outcome" data-oi="' + i + '"></span>' +
        '<span class="num" data-label="Profit each" data-oout="profit_per_outcome" data-oi="' + i + '"></span>' +
        "</div>" +
        '<button type="button" class="icon-btn" data-oremove="' + i + '" aria-label="Remove outcome ' + (i + 1) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
        "</div>"
      );
    }).join("");
    return (
      '<div class="outcomes" id="outcomes">' +
      '<div class="outcome-head" aria-hidden="true"><span>Outcome</span><span>Per month</span><span>Cost each</span><span>Revenue each</span><span>Profit each</span><span></span></div>' +
      (rows || '<p class="hint">No outcomes yet. Add what this workflow delivers, like booked meetings or qualified leads.</p>') +
      "</div>" +
      '<button type="button" class="btn btn-ghost btn-sm add-row" id="btn-add-outcome"><span class="btn-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Add outcome</span></button>'
    );
  }

  function sectionMarkup(sec, wf) {
    var open = !!state.open[sec.n];
    var body = "";
    if (sec.fields) body += '<div class="grid">' + sec.fields.map(function (f) { return fieldMarkup(f, wf); }).join("") + "</div>";
    if (sec.toggle) {
      body += '<label class="switch"><input type="checkbox" data-toggle="' + sec.toggle.key + '"' + (wf[sec.toggle.key] ? " checked" : "") + '><span class="track" aria-hidden="true"></span><span>' + esc(sec.toggle.label) + "<small>" + esc(sec.toggle.sub) + "</small></span></label>";
    }
    if (sec.outcomes) body += outcomesMarkup(wf);
    if (sec.costbar) body += '<div class="costbar-wrap"><div class="costbar-title"><p class="eyebrow">Where the money goes</p><p class="hint" id="costbar-caption"></p></div><div class="costbar" id="costbar" role="img"></div><div class="legend" id="costbar-legend"></div></div>';
    if (sec.readouts) body += readoutsMarkup(sec.readouts);
    if (sec.note) body += '<p class="note"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg><span>' + esc(sec.note) + "</span></p>";
    if (sec.recs) body += '<ul class="recs" id="recs"></ul>';
    return (
      '<section class="sec' + (open ? " is-open" : "") + '" data-sec="' + sec.n + '">' +
      '<button type="button" class="sec-toggle" aria-expanded="' + open + '" aria-controls="sec-body-' + sec.n + '" id="sec-head-' + sec.n + '">' +
      '<span class="sec-num" aria-hidden="true">' + sec.n + "</span>" +
      '<span><span class="sec-title">' + esc(sec.title) + '</span><span class="sec-desc">' + esc(sec.desc) + "</span></span>" +
      '<span class="sec-total" data-sectotal="' + sec.n + '"></span>' +
      '<svg class="sec-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' +
      "</button>" +
      '<div class="sec-body" id="sec-body-' + sec.n + '" role="region" aria-labelledby="sec-head-' + sec.n + '"><div class="sec-inner"><div class="sec-content">' + body + "</div></div></div>" +
      "</section>"
    );
  }

  function renderEditor() {
    var editor = $("#editor");
    var wf = findWorkflow(state.selectedId);
    state.lastRecsKey = "";
    if (!wf) {
      editor.innerHTML = '<div class="editor-empty"><p class="empty-title">Nothing selected</p><p>Add a workflow to start.</p></div>';
      return;
    }
    editor.innerHTML =
      '<header class="ed-head">' +
      '<div class="ed-title-wrap">' +
      '<label class="sr-only" for="ed-name" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Workflow name</label>' +
      '<input class="ed-name" id="ed-name" type="text" value="' + esc(wf.name) + '" autocomplete="off" spellcheck="false">' +
      '<label for="ed-client" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Client</label>' +
      '<input class="ed-client" id="ed-client" type="text" value="' + esc(wf.client) + '" placeholder="Client name" autocomplete="off" spellcheck="false">' +
      '<div class="ed-meta"><span class="chip" id="ed-chip"></span><span class="saved" id="saved-note"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span id="saved-text">Saved on this device</span></span></div>' +
      '<div class="ed-actions">' +
      '<button type="button" class="btn btn-primary btn-sm" id="btn-save"><span class="btn-label">Save</span></button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="btn-duplicate"><span class="btn-label"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>Duplicate</span></button>' +
      '<button type="button" class="btn btn-ghost btn-sm btn-danger" id="btn-delete" data-feedback="none"><span class="btn-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M7 7l1 12h8l1-12M9 7V4h6v3"/></svg>Delete</span></button>' +
      "</div></div>" +
      '<div class="ed-side">' +
      '<div class="ed-figures"><p class="eyebrow">Gross profit</p><p class="big" data-out="gross_profit" data-fmt="money" data-tone="profit">0</p><p class="eyebrow">Delivery cost</p><p class="big" data-out="delivery_cost" data-fmt="money">0</p></div>' +
      '<div class="ring ring-xl" id="ed-ring" role="img">' + ringMarkup("", 7, '<span class="ring-big" id="ed-ring-value">0%</span><span class="ring-small">margin</span>') + "</div>" +
      "</div>" +
      "</header>" +
      '<div class="sections">' + SECTIONS.map(function (s) { return sectionMarkup(s, wf); }).join("") + "</div>";
    $$(".btn", editor).forEach(decorateButton);
    refreshEditor();
  }

  function refreshEditor() {
    var editor = $("#editor");
    var r = findResult(state.selectedId);
    if (!r || !$(".ed-head", editor)) return;

    $$("[data-out]", editor).forEach(function (el) {
      var key = el.getAttribute("data-out");
      var value = r[key];
      animateNumber(el, value, el.getAttribute("data-fmt"));
      var tone = el.getAttribute("data-tone");
      el.classList.remove("is-red", "is-teal", "is-terra");
      if (tone === "profit") el.classList.add(value < 0 ? "is-red" : "is-teal");
      if (tone === "status") el.classList.add(r.status === "red" ? "is-red" : r.status === "amber" ? "is-terra" : "is-teal");
    });

    var chip = $("#ed-chip");
    chip.className = "chip chip-" + r.status;
    chip.textContent = STATUS_LABEL[r.status];

    var ring = $("#ed-ring");
    setRing(ring, r.gross_margin, r.status, "Gross margin " + pct(r.gross_margin));
    animateNumber($("#ed-ring-value"), r.gross_margin, "percent");

    SECTIONS.forEach(function (sec) {
      var el = $('[data-sectotal="' + sec.n + '"]', editor);
      if (!el) return;
      if (sec.recs) {
        var act = r.recommendations.filter(function (x) { return x.id !== "healthy"; }).length;
        el.textContent = act ? act + (act === 1 ? " to act on" : " to act on") : "All clear";
        el.classList.toggle("is-red", r.recommendations.some(function (x) { return x.severity === "red"; }));
        return;
      }
      var v = r[sec.total];
      el.textContent = typeof v === "number" && isFinite(v) ? money(v) + (sec.totalSuffix || "") : "n/a";
      el.classList.toggle("is-red", sec.total === "gross_profit" && v < 0);
    });

    $$("[data-oout]", editor).forEach(function (el) {
      var o = r.outcomes[+el.getAttribute("data-oi")];
      if (!o) return;
      var key = el.getAttribute("data-oout");
      el.textContent = money(o[key]);
      el.classList.remove("is-red", "is-teal");
      if (key === "profit_per_outcome" && typeof o[key] === "number") el.classList.add(o[key] < 0 ? "is-red" : "is-teal");
      if (key === "cost_per_outcome" && o.cost_per_outcome !== null && o.cost_per_outcome > o.revenue_per_outcome) el.classList.add("is-red");
    });

    renderCostbar(r);
    renderRecs(r);
  }

  function renderCostbar(r) {
    var bar = $("#costbar");
    if (!bar) return;
    var parts = [
      { cls: "c-model", label: "AI model", v: r.model_base },
      { cls: "c-retry", label: "Retries", v: r.retry_cost },
      { cls: "c-infra", label: "Automation", v: r.infrastructure_monthly },
      { cls: "c-tools", label: "Tools", v: r.tools_monthly },
      { cls: "c-review", label: "Review", v: r.review_cost },
      { cls: "c-maint", label: "Upkeep", v: r.maintenance_cost },
      r.gross_profit >= 0 ? { cls: "c-profit", label: "Profit", v: r.gross_profit } : { cls: "c-loss", label: "Loss", v: -r.gross_profit }
    ];
    var total = parts.reduce(function (s, p) { return s + Math.max(p.v, 0); }, 0) || 1;
    if (bar.children.length !== parts.length || bar.getAttribute("data-mode") !== parts[6].cls) {
      bar.setAttribute("data-mode", parts[6].cls);
      bar.innerHTML = parts.map(function (p) { return '<span class="' + p.cls + '" style="flex-grow:0"></span>'; }).join("");
    }
    var spans = bar.children;
    requestAnimationFrame(function () {
      parts.forEach(function (p, i) { spans[i].style.flexGrow = String(Math.max(p.v, 0) / total); spans[i].className = p.cls; });
    });
    var revenue = r.revenue_monthly;
    $("#costbar-caption").textContent = r.gross_profit >= 0
      ? "Out of " + money(revenue) + " a month, you keep " + money(r.gross_profit)
      : "Costs are " + money(-r.gross_profit) + " more than the client pays";
    bar.setAttribute("aria-label", parts.map(function (p) { return p.label + " " + money(p.v); }).join(", "));
    $("#costbar-legend").innerHTML = parts.map(function (p) {
      return "<span><i class=\"" + p.cls + "\"></i>" + esc(p.label) + " " + esc(money(p.v)) + "</span>";
    }).join("");
  }

  var REC_ICON = {
    red: '<svg viewBox="0 0 24 24"><path d="M12 8v5M12 16.5h.01"/><circle cx="12" cy="12" r="9"/></svg>',
    amber: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    healthy: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  function renderRecs(r) {
    var list = $("#recs");
    if (!list) return;
    var key = JSON.stringify(r.recommendations);
    if (key === state.lastRecsKey) return;
    state.lastRecsKey = key;
    list.innerHTML = r.recommendations.map(function (rec, i) {
      var tone = rec.id === "healthy" ? "healthy" : rec.severity;
      return (
        '<li class="rec rec-' + tone + '" style="animation-delay:' + (REDUCED ? 0 : i * 45) + 'ms">' +
        '<span class="rec-icon" aria-hidden="true">' + REC_ICON[tone] + "</span>" +
        "<div><p class=\"rec-title\">" + esc(rec.title) + '</p><p class="rec-detail">' + esc(rec.detail) + "</p></div></li>"
      );
    }).join("");
  }

  function flashSaved() {
    var note = $("#saved-note");
    if (!note) return;
    $("#saved-text").textContent = state.storageOk ? "Saved on this device" : "Not saved, storage is blocked";
    note.classList.remove("is-flash");
    void note.offsetWidth;
    note.classList.add("is-flash");
  }

  // ---------- input parsing ----------

  function parseField(raw, kind) {
    var text = String(raw).replace(/[,\s]/g, "").replace(/^[$€£₹¥]/, "").replace(/%$/, "");
    if (text === "") {
      if (kind === "optionalMoney") return { ok: true, value: null };
      return { ok: false, msg: "Enter a number" };
    }
    if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(text)) return { ok: false, msg: "Use digits only, like 1500" };
    var n = Number(text);
    if (!isFinite(n)) return { ok: false, msg: "That number is too big" };
    if (n < 0) return { ok: false, msg: "Use 0 or more" };
    if (kind === "percent") {
      if (n > 100) return { ok: false, msg: "Use 0 to 100" };
      return { ok: true, value: n / 100 };
    }
    if (kind === "int" && n % 1) return { ok: false, msg: "Use a whole number" };
    return { ok: true, value: n };
  }

  function setFieldState(fieldEl, ok, msg) {
    if (!fieldEl) return;
    var input = $("input", fieldEl);
    var err = $(".error-text", fieldEl);
    clearTimeout(fieldEl._t);
    if (ok) {
      fieldEl.classList.remove("is-invalid");
      if (input) input.removeAttribute("aria-invalid");
      if (err) err.hidden = true;
      fieldEl.classList.add("is-valid");
      fieldEl._t = setTimeout(function () { fieldEl.classList.remove("is-valid"); }, 900);
    } else {
      fieldEl.classList.remove("is-valid");
      if (!fieldEl.classList.contains("is-invalid")) fieldEl.classList.add("is-invalid");
      if (input) input.setAttribute("aria-invalid", "true");
      if (err) { err.textContent = msg; err.hidden = false; }
    }
  }

  function applyChange(patch) {
    setData(withWorkflow(state.selectedId, patch));
    renderSummary();
    renderList();
    refreshEditor();
    scheduleSave();
  }

  function onEditorInput(ev) {
    var t = ev.target;
    var wf = findWorkflow(state.selectedId);
    if (!wf) return;
    if (t.id === "ed-name") { applyChange({ name: t.value }); return; }
    if (t.id === "ed-client") { applyChange({ client: t.value }); return; }
    if (t.hasAttribute("data-key")) {
      var res = parseField(t.value, t.getAttribute("data-kind"));
      setFieldState(t.closest(".field"), res.ok, res.msg);
      if (res.ok) { var patch = {}; patch[t.getAttribute("data-key")] = res.value; applyChange(patch); }
      return;
    }
    if (t.hasAttribute("data-oname") || t.hasAttribute("data-ocount")) {
      var i = +(t.getAttribute("data-oname") || t.getAttribute("data-ocount"));
      var outcomes = wf.outcomes.map(function (o) { return Object.assign({}, o); });
      if (t.hasAttribute("data-oname")) {
        outcomes[i].name = t.value;
      } else {
        var c = parseField(t.value, "int");
        setFieldState(t.closest(".field"), c.ok, c.msg);
        if (!c.ok) return;
        outcomes[i].count = c.value;
      }
      applyChange({ outcomes: outcomes });
    }
  }

  function onEditorBlur(ev) {
    var t = ev.target;
    var fieldEl = t.closest && t.closest(".field");
    if (!fieldEl || !fieldEl.classList.contains("is-invalid")) return;
    var wf = findWorkflow(state.selectedId);
    if (t.hasAttribute("data-key")) {
      var def = null;
      SECTIONS.forEach(function (s) { (s.fields || []).forEach(function (f) { if (f.key === t.getAttribute("data-key")) def = f; }); });
      if (def) t.value = inputValue(def, wf);
    } else if (t.hasAttribute("data-ocount")) {
      t.value = String(wf.outcomes[+t.getAttribute("data-ocount")].count);
    }
    fieldEl.classList.remove("is-invalid");
    t.removeAttribute("aria-invalid");
    $(".error-text", fieldEl).hidden = true;
    toast("Kept the last valid number", {});
  }

  function rerenderOutcomes(focusLast) {
    var wf = findWorkflow(state.selectedId);
    var host = $("#outcomes");
    if (!host) return;
    var wrap = document.createElement("div");
    wrap.innerHTML = outcomesMarkup(wf);
    host.parentNode.replaceChild(wrap.firstChild, host);
    var oldBtn = $("#btn-add-outcome");
    if (oldBtn) oldBtn.parentNode.removeChild(oldBtn);
    var newBtn = wrap.querySelector("#btn-add-outcome");
    $("#outcomes").insertAdjacentElement("afterend", newBtn);
    decorateButton(newBtn);
    refreshEditor();
    if (focusLast) {
      var inputs = $$("[data-oname]");
      if (inputs.length) { inputs[inputs.length - 1].focus(); inputs[inputs.length - 1].select(); }
    }
  }

  function onEditorClick(ev) {
    var t = ev.target.closest("button");
    if (!t) return;
    var wf = findWorkflow(state.selectedId);
    if (t.classList.contains("sec-toggle")) {
      var sec = t.closest(".sec");
      var n = +sec.getAttribute("data-sec");
      var open = !sec.classList.contains("is-open");
      sec.classList.toggle("is-open", open);
      t.setAttribute("aria-expanded", String(open));
      state.open = Object.assign({}, state.open, (function () { var o = {}; o[n] = open; return o; })());
      scheduleSave();
      return;
    }
    if (t.id === "btn-save") {
      withFeedback(t, function () {
        clearTimeout(saveTimer);
        var ok = saveNow();
        toast(ok ? "Saved on this device" : "Saving is blocked in this browser. Export JSON to keep your work.", { error: !ok });
      });
      return;
    }
    if (t.id === "btn-duplicate") {
      withFeedback(t, function () {
        var copy = Object.assign(clone(wf), { id: uniqueId(wf.id + "-copy"), name: wf.name + " (copy)" });
        var idx = state.data.workflows.indexOf(wf);
        var list = state.data.workflows.slice();
        list.splice(idx + 1, 0, copy);
        state.selectedId = copy.id;
        setData(Object.assign({}, state.data, { workflows: list }));
        renderAll();
        saveNow();
        toast("Duplicated " + wf.name);
      });
      return;
    }
    if (t.id === "btn-delete") {
      var snap = snapshot();
      var idx2 = state.data.workflows.indexOf(wf);
      var rest = state.data.workflows.filter(function (w) { return w.id !== wf.id; });
      var next = rest[Math.min(idx2, rest.length - 1)];
      state.selectedId = next ? next.id : null;
      setData(Object.assign({}, state.data, { workflows: rest }));
      renderAll();
      saveNow();
      toast("Deleted " + (wf.name || "the workflow"), { action: undoable("Workflow restored", snap) });
      return;
    }
    if (t.id === "btn-add-outcome") {
      withFeedback(t, function () {
        var outcomes = wf.outcomes.concat([{ name: "New outcome", count: 10 }]);
        setData(withWorkflow(state.selectedId, { outcomes: outcomes }));
        renderSummary(); renderList();
        rerenderOutcomes(true);
        scheduleSave();
      });
      return;
    }
    if (t.hasAttribute("data-oremove")) {
      var i = +t.getAttribute("data-oremove");
      var removed = wf.outcomes[i];
      var snap2 = snapshot();
      setData(withWorkflow(state.selectedId, { outcomes: wf.outcomes.filter(function (_, j) { return j !== i; }) }));
      renderSummary(); renderList();
      rerenderOutcomes(false);
      scheduleSave();
      toast("Removed " + (removed.name || "the outcome"), { action: undoable("Outcome restored", snap2) });
    }
  }

  function onEditorChange(ev) {
    var t = ev.target;
    if (t.hasAttribute("data-toggle")) {
      var patch = {};
      patch[t.getAttribute("data-toggle")] = t.checked;
      applyChange(patch);
    }
  }

  // ---------- top level actions ----------

  function renderAll(full) {
    if (full) { $("#workflow-list").innerHTML = ""; }
    renderSummary();
    renderList();
    renderEditor();
  }

  function selectWorkflow(id, scroll) {
    if (id === state.selectedId) return;
    state.selectedId = id;
    renderList();
    renderEditor();
    scheduleSave();
    if (scroll && window.innerWidth <= 980) {
      $("#editor").scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "start" });
    }
  }

  function addWorkflow(btn) {
    return withFeedback(btn, function () {
      var wf = E.newWorkflow(state.data.workflows.map(function (w) { return w.id; }));
      state.selectedId = wf.id;
      setData(Object.assign({}, state.data, { workflows: state.data.workflows.concat([wf]) }));
      renderAll();
      saveNow();
      toast("Added a new workflow with starter numbers");
      var name = $("#ed-name");
      if (name) { name.focus(); name.select(); }
    });
  }

  function todayStamp() {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function exportJSON(btn) {
    withFeedback(btn, function () {
      var name = "ai-agent-workflows-" + todayStamp() + ".json";
      download(name, JSON.stringify(state.data, null, 2) + "\n", "application/json");
      toast("Exported " + name);
    });
  }

  function exportCSV(btn) {
    withFeedback(btn, function () {
      var name = "ai-agent-profitability-" + todayStamp() + ".csv";
      download(name, E.toCSV(state.data), "text/csv");
      toast("Exported " + name);
    });
  }

  function buildPrintSheet() {
    var p = state.portfolio;
    var rows = p.workflows.map(function (r) {
      return "<tr><td><b>" + esc(r.name) + "</b><br><small>" + esc(r.client) + "</small></td>" +
        '<td class="r">' + esc(money(r.revenue_monthly)) + '</td><td class="r">' + esc(money(r.delivery_cost)) + '</td><td class="r">' + esc(money(r.gross_profit)) +
        '</td><td class="r">' + esc(pct(r.gross_margin)) + '</td><td class="r">' + esc(money(r.price_for_target)) + '</td><td class="st-' + r.status + '">' + esc(STATUS_LABEL[r.status]) + "</td></tr>";
    }).join("");
    var recs = p.workflows.map(function (r) {
      return '<div class="p-wf"><h2>' + esc(r.name) + "</h2><ul>" + r.recommendations.map(function (x) { return "<li><b>" + esc(x.title) + ".</b> " + esc(x.detail) + "</li>"; }).join("") + "</ul></div>";
    }).join("");
    $("#print-sheet").innerHTML =
      "<h1>AI Agent Profitability Summary</h1>" +
      '<p class="p-sub">' + esc(todayStamp()) + ". Target margin " + settingPct(state.data.target_margin) + ", warning margin " + settingPct(state.data.warning_margin) + ". Monthly figures.</p>" +
      '<div class="p-stats">' +
      '<div class="p-stat"><span>Total revenue</span><b>' + esc(money(p.total_revenue)) + "</b></div>" +
      '<div class="p-stat"><span>Delivery cost</span><b>' + esc(money(p.total_delivery_cost)) + "</b></div>" +
      '<div class="p-stat"><span>Gross profit</span><b>' + esc(money(p.total_gross_profit)) + "</b></div>" +
      '<div class="p-stat"><span>Portfolio margin</span><b>' + esc(pct(p.portfolio_margin)) + "</b></div></div>" +
      '<table><thead><tr><th>Workflow</th><th class="r">Revenue</th><th class="r">Delivery cost</th><th class="r">Profit</th><th class="r">Margin</th><th class="r">Price for target</th><th>Status</th></tr></thead><tbody>' + rows + "</tbody></table>" +
      recs +
      '<p class="p-foot">Made with the AI Agent Profitability Calculator. Token prices are example rates unless you replaced them. Computed on this device.</p>';
  }

  function printSummary(btn) {
    withFeedback(btn, function () {
      buildPrintSheet();
      toast("Summary ready. Choose Save as PDF to keep a copy.");
      setTimeout(function () { window.print(); }, 120);
    });
  }

  function loadSample() {
    var snap = snapshot();
    var count = state.data.workflows.length;
    var go = count ? confirmBox("Load the sample workflows?", "This replaces your " + count + (count === 1 ? " workflow" : " workflows") + " with 3 fictional samples. You can undo right after.", "Load sample") : Promise.resolve(true);
    return go.then(function (ok) {
      if (!ok) return false;
      state.selectedId = null;
      setData(E.sampleData());
      renderAll(true);
      saveNow();
      toast("Loaded the 3 sample workflows", count ? { action: undoable("Your workflows are back", snap) } : {});
      return true;
    });
  }

  function resetAll() {
    var snap = snapshot();
    confirmBox("Start empty?", "This removes every workflow on this device. You can undo right after, or export JSON first to keep a copy.", "Remove all").then(function (ok) {
      if (!ok) return;
      setData(Object.assign({}, state.data, { workflows: [] }));
      renderAll(true);
      saveNow();
      toast("Cleared all workflows", { action: undoable("Your workflows are back", snap) });
    });
  }

  function importFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { toast("Could not read that file", { error: true }); };
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (err) {
        toast("That file is not valid JSON", { error: true });
        return;
      }
      if (!parsed || !Array.isArray(parsed.workflows)) {
        toast("No workflows found. The file needs a workflows list.", { error: true });
        return;
      }
      var incoming = E.normalizeData(parsed);
      var snap = snapshot();
      var count = state.data.workflows.length;
      confirmBox("Import " + incoming.workflows.length + (incoming.workflows.length === 1 ? " workflow?" : " workflows?"),
        "This replaces the " + count + (count === 1 ? " workflow" : " workflows") + " on this device with the ones in " + file.name + ".", "Import").then(function (ok) {
        if (!ok) return;
        state.selectedId = null;
        setData(incoming);
        renderAll(true);
        saveNow();
        toast("Imported " + incoming.workflows.length + (incoming.workflows.length === 1 ? " workflow" : " workflows"), { action: undoable("Import undone", snap) });
      });
    };
    reader.readAsText(file);
  }

  // ---------- settings ----------

  function openSettings() {
    var dlg = $("#settings-dialog");
    $("#set-currency").value = state.data.currency;
    $("#set-target").value = String(+(state.data.target_margin * 100).toFixed(2));
    $("#set-warning").value = String(+(state.data.warning_margin * 100).toFixed(2));
    ["#set-target-error", "#set-warning-error"].forEach(function (s) { $(s).hidden = true; });
    if (typeof dlg.showModal === "function") dlg.showModal();
  }

  function readSettings() {
    var cur = $("#set-currency").value.trim() || "USD";
    var t = parseField($("#set-target").value, "percent");
    var w = parseField($("#set-warning").value, "percent");
    var errs = {};
    if (!t.ok) errs.target = t.msg;
    else if (t.value >= 1 || t.value <= 0) errs.target = "Use a number between 0 and 100";
    if (!w.ok) errs.warning = w.msg;
    else if (t.ok && w.value > t.value) errs.warning = "Keep it at or below the target";
    [["target", "#set-target-error", "#set-target"], ["warning", "#set-warning-error", "#set-warning"]].forEach(function (x) {
      var el = $(x[1]);
      var field = $(x[2]).closest(".field");
      el.hidden = !errs[x[0]];
      el.textContent = errs[x[0]] || "";
      field.classList.toggle("is-invalid", !!errs[x[0]]);
    });
    if (errs.target || errs.warning) return null;
    return { currency: cur.toUpperCase().length === 3 && /^[a-z]{3}$/i.test(cur) ? cur.toUpperCase() : cur, target_margin: t.value, warning_margin: w.value };
  }

  // ---------- wiring ----------

  function bind() {
    $$(".btn").forEach(decorateButton);
    $("#btn-add").addEventListener("click", function (e) { addWorkflow(e.currentTarget); });
    $("#btn-add-empty").addEventListener("click", function (e) { addWorkflow(e.currentTarget); });
    $("#btn-sample-empty").addEventListener("click", function (e) { var b = e.currentTarget; withFeedback(b, loadSample); });
    $("#btn-export-json").addEventListener("click", function (e) { exportJSON(e.currentTarget); });
    $("#btn-export-csv").addEventListener("click", function (e) { exportCSV(e.currentTarget); });
    $("#btn-print").addEventListener("click", function (e) { printSummary(e.currentTarget); });
    $("#btn-import").addEventListener("click", function () { $("#import-file").click(); });
    $("#import-file").addEventListener("change", function (e) { importFile(e.target.files && e.target.files[0]); e.target.value = ""; });
    $("#btn-settings").addEventListener("click", openSettings);

    var more = $("#btn-more");
    var menu = $("#more-menu");
    var closeMenu = function () { menu.hidden = true; more.setAttribute("aria-expanded", "false"); };
    more.addEventListener("click", function () {
      var open = menu.hidden;
      menu.hidden = !open;
      more.setAttribute("aria-expanded", String(open));
      if (open) $("button", menu).focus();
    });
    document.addEventListener("click", function (e) { if (!menu.hidden && !e.target.closest(".menu-wrap")) closeMenu(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) { closeMenu(); more.focus(); } });
    menu.addEventListener("keydown", function (e) {
      var items = $$("button", menu);
      var i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    });
    $("#btn-load-sample").addEventListener("click", function () { closeMenu(); loadSample(); });
    $("#btn-reset").addEventListener("click", function () { closeMenu(); resetAll(); });

    $("#settings-cancel").addEventListener("click", function () { $("#settings-dialog").close(); });
    $("#settings-save").addEventListener("click", function (e) {
      var btn = e.currentTarget;
      var next = readSettings();
      if (!next) return;
      withFeedback(btn, function () {
        setData(Object.assign({}, state.data, next));
        renderAll();
        saveNow();
        setTimeout(function () { $("#settings-dialog").close(); }, REDUCED ? 0 : 500);
        toast("Settings saved");
      });
    });
    $("#settings-form").addEventListener("submit", function (e) { e.preventDefault(); $("#settings-save").click(); });

    var list = $("#workflow-list");
    list.addEventListener("click", function (e) {
      var card = e.target.closest(".wf-card");
      if (card) selectWorkflow(card.getAttribute("data-id"), true);
    });
    list.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      var cards = $$(".wf-card", list);
      var i = cards.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      var next = cards[e.key === "ArrowDown" ? Math.min(i + 1, cards.length - 1) : Math.max(i - 1, 0)];
      next.focus();
    });

    var editor = $("#editor");
    editor.addEventListener("input", onEditorInput);
    editor.addEventListener("change", onEditorChange);
    editor.addEventListener("click", onEditorClick);
    editor.addEventListener("focusout", onEditorBlur);

    window.addEventListener("beforeprint", buildPrintSheet);
  }

  function init() {
    if (!E) {
      document.body.innerHTML = "<p style='padding:24px'>engine.js did not load. Keep app.js and engine.js in the same folder.</p>";
      return;
    }
    var saved = loadSaved();
    if (saved) {
      state.selectedId = saved.ui && saved.ui.selectedId;
      if (saved.ui && saved.ui.open) state.open = Object.assign({}, state.open, saved.ui.open);
      setData(saved.data);
    } else {
      setData(E.sampleData());
      state.storageOk = probeStorage();
    }
    bind();
    updatePrivacyNote();
    renderAll(true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // A tiny handle for automated checks of this page (read only use).
  window.ProfitApp = { state: state, select: function (id) { selectWorkflow(id, false); } };
})();
