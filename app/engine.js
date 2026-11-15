/*
 * AI Agent Profitability Calculator: the math engine.
 *
 * This file is the single JavaScript source of the math. It runs as a classic
 * browser script (window.ProfitEngine) and can be loaded from Node
 * (module.exports, or globalThis.ProfitEngine). tools/margin.py implements the
 * same formulas and must match it to the cent.
 *
 * Compute in full precision, round only for display.
 * No network calls, no storage, no side effects.
 */
(function (root) {
  "use strict";

  var VERSION = "1.0.0";

  var DEFAULT_SETTINGS = { currency: "USD", target_margin: 0.6, warning_margin: 0.5 };

  var NUMBER_FIELDS = [
    "revenue_monthly",
    "runs_monthly",
    "agent_calls_per_run",
    "input_tokens_per_call",
    "output_tokens_per_call",
    "price_input_per_million",
    "price_output_per_million",
    "retry_rate",
    "infrastructure_monthly",
    "tools_monthly",
    "review_hours",
    "maintenance_hours",
    "hourly_rate"
  ];

  // The 3 fictional sample workflows. Keep identical to data/sample-workflows.json.
  var SAMPLE_DATA = {
    currency: "USD",
    target_margin: 0.6,
    warning_margin: 0.5,
    workflows: [
      {
        id: "ai-sdr-outbound",
        name: "AI SDR outbound campaign",
        client: "Sample client A (fictional)",
        revenue_monthly: 1500,
        runs_monthly: 1000,
        agent_calls_per_run: 5,
        input_tokens_per_call: 3000,
        output_tokens_per_call: 1400,
        price_input_per_million: 3,
        price_output_per_million: 15,
        retry_rate: 0.2,
        model_cost_override: null,
        infrastructure_monthly: 70,
        tools_monthly: 100,
        review_hours: 4,
        maintenance_hours: 2,
        hourly_rate: 25,
        rule_based: false,
        outcomes: [
          { name: "Qualified leads", count: 40 },
          { name: "Booked meetings", count: 10 }
        ]
      },
      {
        id: "ai-voice-follow-ups",
        name: "AI voice follow ups",
        client: "Sample client B (fictional)",
        revenue_monthly: 800,
        runs_monthly: 600,
        agent_calls_per_run: 8,
        input_tokens_per_call: 3000,
        output_tokens_per_call: 1000,
        price_input_per_million: 3,
        price_output_per_million: 15,
        retry_rate: 0.3,
        model_cost_override: null,
        infrastructure_monthly: 180,
        tools_monthly: 60,
        review_hours: 3,
        maintenance_hours: 2,
        hourly_rate: 25,
        rule_based: true,
        outcomes: [{ name: "Booked meetings", count: 15 }]
      },
      {
        id: "inbox-reply-agent",
        name: "Inbox reply agent",
        client: "Sample client C (fictional)",
        revenue_monthly: 1000,
        runs_monthly: 1500,
        agent_calls_per_run: 2,
        input_tokens_per_call: 2000,
        output_tokens_per_call: 500,
        price_input_per_million: 3,
        price_output_per_million: 15,
        retry_rate: 0.1,
        model_cost_override: null,
        infrastructure_monthly: 30,
        tools_monthly: 40,
        review_hours: 2,
        maintenance_hours: 1,
        hourly_rate: 25,
        rule_based: false,
        outcomes: [{ name: "Replies handled", count: 120 }]
      }
    ]
  };

  // ---------- small helpers ----------

  function num(value, fallback) {
    if (typeof value === "number" && isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && isFinite(Number(value))) return Number(value);
    return fallback === undefined ? 0 : fallback;
  }

  function isNumber(value) {
    return typeof value === "number" && isFinite(value);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sampleData() {
    return clone(SAMPLE_DATA);
  }

  function slugify(text) {
    var slug = String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, "-");
    return slug || "workflow";
  }

  function settingsFrom(source) {
    var s = source || {};
    return {
      currency: typeof s.currency === "string" && s.currency.trim() ? s.currency.trim() : DEFAULT_SETTINGS.currency,
      target_margin: num(s.target_margin, DEFAULT_SETTINGS.target_margin),
      warning_margin: num(s.warning_margin, DEFAULT_SETTINGS.warning_margin)
    };
  }

  /** Returns a new workflow object with every field present and typed. */
  function normalizeWorkflow(wf, index) {
    var w = wf || {};
    var out = {
      id: typeof w.id === "string" && w.id ? w.id : slugify(w.name) + "-" + (index === undefined ? 1 : index + 1),
      name: typeof w.name === "string" ? w.name : "Untitled workflow",
      client: typeof w.client === "string" ? w.client : ""
    };
    NUMBER_FIELDS.forEach(function (field) {
      out[field] = num(w[field], 0);
    });
    out.model_cost_override = isNumber(w.model_cost_override)
      ? w.model_cost_override
      : typeof w.model_cost_override === "string" && w.model_cost_override.trim() !== "" && isFinite(Number(w.model_cost_override))
      ? Number(w.model_cost_override)
      : null;
    out.rule_based = w.rule_based === true;
    out.outcomes = Array.isArray(w.outcomes)
      ? w.outcomes.map(function (o) {
          return { name: o && typeof o.name === "string" ? o.name : "Outcome", count: num(o && o.count, 0) };
        })
      : [];
    return out;
  }

  /** Returns a new data object (settings plus normalized workflows). */
  function normalizeData(data) {
    var d = data || {};
    var s = settingsFrom(d);
    var list = Array.isArray(d.workflows) ? d.workflows : [];
    return {
      currency: s.currency,
      target_margin: s.target_margin,
      warning_margin: s.warning_margin,
      workflows: list.map(normalizeWorkflow)
    };
  }

  function newWorkflow(existingIds) {
    var ids = existingIds || [];
    var n = 1;
    while (ids.indexOf("new-workflow-" + n) !== -1) n += 1;
    return normalizeWorkflow({
      id: "new-workflow-" + n,
      name: "New workflow",
      client: "",
      revenue_monthly: 1000,
      runs_monthly: 500,
      agent_calls_per_run: 3,
      input_tokens_per_call: 2000,
      output_tokens_per_call: 600,
      price_input_per_million: 3,
      price_output_per_million: 15,
      retry_rate: 0.1,
      model_cost_override: null,
      infrastructure_monthly: 50,
      tools_monthly: 50,
      review_hours: 2,
      maintenance_hours: 1,
      hourly_rate: 25,
      rule_based: false,
      outcomes: [{ name: "Outcomes delivered", count: 50 }]
    });
  }

  // ---------- the math ----------

  function statusFor(margin, settings) {
    if (margin === null) return "red";
    if (margin < settings.warning_margin) return "red";
    if (margin < settings.target_margin) return "amber";
    return "green";
  }

  /**
   * Computes one workflow. Returns a new result object; never changes the input.
   * settings: { target_margin, warning_margin, currency }
   */
  function computeWorkflow(workflow, settingsIn) {
    var wf = normalizeWorkflow(workflow);
    var settings = settingsFrom(settingsIn);

    var modelBase =
      (wf.runs_monthly *
        wf.agent_calls_per_run *
        (wf.input_tokens_per_call * wf.price_input_per_million + wf.output_tokens_per_call * wf.price_output_per_million)) /
      1000000;
    var retryCost = modelBase * wf.retry_rate;
    var modelCost = modelBase + retryCost;
    var overridden = false;

    if (isNumber(wf.model_cost_override)) {
      overridden = true;
      modelCost = wf.model_cost_override;
      modelBase = 1 + wf.retry_rate === 0 ? 0 : wf.model_cost_override / (1 + wf.retry_rate);
      retryCost = wf.model_cost_override - modelBase;
    }

    var reviewCost = wf.review_hours * wf.hourly_rate;
    var maintenanceCost = wf.maintenance_hours * wf.hourly_rate;
    var agentCosts = modelBase + wf.infrastructure_monthly + wf.tools_monthly;
    var hiddenCosts = retryCost + reviewCost + maintenanceCost;
    var deliveryCost = agentCosts + hiddenCosts;
    var grossProfit = wf.revenue_monthly - deliveryCost;
    var grossMargin = wf.revenue_monthly === 0 ? null : grossProfit / wf.revenue_monthly;
    var modelShare = deliveryCost === 0 ? 0 : modelCost / deliveryCost;
    var costPerRun = wf.runs_monthly === 0 ? null : deliveryCost / wf.runs_monthly;
    var tokensMonthly = wf.runs_monthly * wf.agent_calls_per_run * (wf.input_tokens_per_call + wf.output_tokens_per_call);

    var outcomes = wf.outcomes.map(function (o) {
      var c = o.count;
      return {
        name: o.name,
        count: c,
        cost_per_outcome: c === 0 ? null : deliveryCost / c,
        revenue_per_outcome: c === 0 ? null : wf.revenue_monthly / c,
        profit_per_outcome: c === 0 ? null : grossProfit / c
      };
    });
    var totalOutcomes = wf.outcomes.reduce(function (sum, o) {
      return sum + o.count;
    }, 0);

    var result = {
      id: wf.id,
      name: wf.name,
      client: wf.client,
      input: wf,
      revenue_monthly: wf.revenue_monthly,
      tokens_monthly: tokensMonthly,
      model_override_used: overridden,
      model_base: modelBase,
      retry_cost: retryCost,
      model_cost: modelCost,
      infrastructure_monthly: wf.infrastructure_monthly,
      tools_monthly: wf.tools_monthly,
      review_cost: reviewCost,
      maintenance_cost: maintenanceCost,
      agent_costs: agentCosts,
      hidden_costs: hiddenCosts,
      delivery_cost: deliveryCost,
      gross_profit: grossProfit,
      gross_margin: grossMargin,
      model_share: modelShare,
      cost_per_run: costPerRun,
      outcomes: outcomes,
      total_outcomes: totalOutcomes,
      break_even_price: deliveryCost,
      price_for_target: settings.target_margin < 1 ? deliveryCost / (1 - settings.target_margin) : null,
      status: statusFor(grossMargin, settings)
    };
    result.recommendations = recommend(result, settings);
    return result;
  }

  // ---------- formatting (display only) ----------

  var SYMBOLS = { USD: "$", EUR: "€", GBP: "£", INR: "₹", JPY: "¥", AUD: "A$", CAD: "C$" };

  function currencySymbol(currency) {
    var c = String(currency || "USD").trim();
    if (SYMBOLS[c.toUpperCase()]) return SYMBOLS[c.toUpperCase()];
    if (/^[A-Za-z]{3}$/.test(c)) return c.toUpperCase() + " ";
    return c;
  }

  function groupThousands(text) {
    var parts = text.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }

  function formatMoney(value, currency) {
    if (!isNumber(value)) return "n/a";
    var sign = value < 0 ? "-" : "";
    return sign + currencySymbol(currency) + groupThousands(Math.abs(value).toFixed(2));
  }

  function formatPercent(fraction, decimals) {
    if (!isNumber(fraction)) return "n/a";
    return (fraction * 100).toFixed(decimals === undefined ? 1 : decimals) + "%";
  }

  function formatNumber(value, decimals) {
    if (!isNumber(value)) return "n/a";
    return groupThousands(value.toFixed(decimals || 0));
  }

  function round2(value) {
    return isNumber(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : value;
  }

  function round1Percent(fraction) {
    return isNumber(fraction) ? Math.round((fraction * 100 + Number.EPSILON) * 10) / 10 : fraction;
  }

  // ---------- recommendations (component 5) ----------

  /**
   * Same ids, order and thresholds as tools/margin.py.
   * Emits every item that applies; "healthy" only when none apply.
   */
  function recommend(r, settingsIn) {
    var settings = settingsFrom(settingsIn);
    var cur = settings.currency;
    var m = function (v) {
      return formatMoney(v, cur);
    };
    var p = function (v) {
      return formatPercent(v);
    };
    // Settings read better without a trailing ".0" (50% instead of 50.0%).
    var ps = function (v) {
      var whole = Math.round(v * 1000) % 10 === 0;
      return formatPercent(v, whole ? 0 : 1);
    };
    var wf = r.input || normalizeWorkflow(r);
    var items = [];
    var margin = r.gross_margin;
    var priceText = r.price_for_target === null ? "a higher price" : m(r.price_for_target) + " a month";

    // 1. margin_below_warning
    if (margin === null || margin < settings.warning_margin) {
      var costCap = r.revenue_monthly * (1 - settings.target_margin);
      items.push({
        id: "margin_below_warning",
        severity: "red",
        title: "Margin is under your warning line",
        detail:
          margin === null
            ? "There is no revenue set for this workflow yet. Charge at least " + priceText + " to reach your " + ps(settings.target_margin) + " target."
            : "Gross margin is " + p(margin) + ", under your " + ps(settings.warning_margin) + " warning line. Charge at least " + priceText +
              " to reach your " + ps(settings.target_margin) + " target, or bring delivery cost down to " + m(Math.max(costCap, 0)) + "."
      });
    }
    // 2. margin_below_target
    if (margin !== null && margin >= settings.warning_margin && margin < settings.target_margin) {
      items.push({
        id: "margin_below_target",
        severity: "amber",
        title: "Margin is under your target",
        detail: "Gross margin is " + p(margin) + ", under your " + ps(settings.target_margin) + " target. A price of " + priceText + " reaches the target."
      });
    }
    // 3. model_heavy
    if (r.model_share > 0.4) {
      items.push({
        id: "model_heavy",
        severity: "amber",
        title: "The AI model is a big part of your cost",
        detail:
          "The AI model is " + p(r.model_share) + " of delivery cost (" + m(r.model_cost) + " a month). Route simple steps to a cheaper model, trim the context you send, and cache what repeats."
      });
    }
    // 4. retries_high
    if (wf.retry_rate > 0.15) {
      items.push({
        id: "retries_high",
        severity: "amber",
        title: "Retries cost you real money",
        detail: p(wf.retry_rate) + " of runs are tried again, which costs " + m(r.retry_cost) + " a month. Fix the failing step before you scale this workflow."
      });
    }
    // 5. chatty_agents
    if (wf.agent_calls_per_run > 4) {
      items.push({
        id: "chatty_agents",
        severity: "amber",
        title: "Agents pass work back and forth a lot",
        detail:
          "Each run makes " + formatNumber(wf.agent_calls_per_run, wf.agent_calls_per_run % 1 ? 1 : 0) +
          " agent calls. Agents passing work to each other multiply tokens, so merge steps or cut hand offs."
      });
    }
    // 6. review_heavy
    var hours = wf.review_hours + wf.maintenance_hours;
    var outcomeCount = r.total_outcomes === undefined ? 0 : r.total_outcomes;
    var hoursPerOutcome = hours / Math.max(outcomeCount, 1);
    if (hoursPerOutcome > 0.25) {
      items.push({
        id: "review_heavy",
        severity: "info",
        title: "People spend a lot of time per outcome",
        detail:
          "Review and upkeep take " + formatNumber(hoursPerOutcome, 2) + " hours per outcome (" + formatNumber(hours, hours % 1 ? 1 : 0) + " hours for " +
          formatNumber(outcomeCount, 0) + " outcomes). Check a sample instead of every item, or fix the step that needs the most checking."
      });
    }
    // 7. use_simple_automation
    if (wf.rule_based) {
      items.push({
        id: "use_simple_automation",
        severity: "info",
        title: "This may not need an AI model",
        detail:
          "You marked this as a fixed rule workflow. Plain automation can often run it without a model, which would remove up to " + m(r.model_cost) + " a month of model cost."
      });
    }
    // 8. losing_per_outcome
    var losing = (r.outcomes || []).filter(function (o) {
      return o.cost_per_outcome !== null && o.revenue_per_outcome !== null && o.cost_per_outcome > o.revenue_per_outcome;
    });
    if (losing.length) {
      items.push({
        id: "losing_per_outcome",
        severity: "red",
        title: "You lose money on an outcome",
        detail: losing
          .map(function (o) {
            return "Each of your " + o.name + " costs " + m(o.cost_per_outcome) + " to deliver but brings in " + m(o.revenue_per_outcome) + ".";
          })
          .join(" ")
      });
    }
    if (!items.length) {
      items.push({
        id: "healthy",
        severity: "info",
        title: "This workflow looks healthy",
        detail: "Gross margin is " + p(margin) + ", at or above your " + ps(settings.target_margin) + " target, and no cost stands out. Check again when prices or volumes change."
      });
    }
    return items;
  }

  // ---------- portfolio (component 4) ----------

  function computePortfolio(dataIn) {
    var data = normalizeData(dataIn);
    var settings = settingsFrom(data);
    var results = data.workflows.map(function (wf) {
      return computeWorkflow(wf, settings);
    });
    var revenue = 0;
    var delivery = 0;
    var profit = 0;
    var modelCost = 0;
    results.forEach(function (r) {
      revenue += r.revenue_monthly;
      delivery += r.delivery_cost;
      profit += r.gross_profit;
      modelCost += r.model_cost;
    });
    var ranked = results.filter(function (r) {
      return r.gross_margin !== null;
    });
    var most = null;
    var least = null;
    ranked.forEach(function (r) {
      if (most === null || r.gross_margin > most.gross_margin) most = r;
      if (least === null || r.gross_margin < least.gross_margin) least = r;
    });
    var pick = function (r) {
      return r ? { id: r.id, name: r.name, gross_margin: r.gross_margin } : null;
    };
    var margin = revenue === 0 ? null : profit / revenue;
    return {
      settings: settings,
      workflows: results,
      total_revenue: revenue,
      total_delivery_cost: delivery,
      total_gross_profit: profit,
      total_model_cost: modelCost,
      portfolio_margin: margin,
      portfolio_status: statusFor(margin, settings),
      red_count: results.filter(function (r) {
        return r.status === "red";
      }).length,
      amber_count: results.filter(function (r) {
        return r.status === "amber";
      }).length,
      most_profitable: pick(most),
      least_profitable: pick(least)
    };
  }

  // ---------- CSV export ----------

  function csvCell(value) {
    if (value === null || value === undefined) return "";
    var text = typeof value === "number" ? String(value) : String(value);
    return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function toCSV(dataIn) {
    var p = computePortfolio(dataIn);
    var header = [
      "id", "name", "client", "status", "revenue_monthly", "model_base", "retry_cost", "model_cost",
      "infrastructure_monthly", "tools_monthly", "review_cost", "maintenance_cost", "agent_costs", "hidden_costs",
      "delivery_cost", "gross_profit", "gross_margin_percent", "model_share_percent", "cost_per_run",
      "break_even_price", "price_for_target", "recommendations"
    ];
    var rows = [header.join(",")];
    p.workflows.forEach(function (r) {
      rows.push(
        [
          r.id, r.name, r.client, r.status, round2(r.revenue_monthly), round2(r.model_base), round2(r.retry_cost),
          round2(r.model_cost), round2(r.infrastructure_monthly), round2(r.tools_monthly), round2(r.review_cost),
          round2(r.maintenance_cost), round2(r.agent_costs), round2(r.hidden_costs), round2(r.delivery_cost),
          round2(r.gross_profit), round1Percent(r.gross_margin), round1Percent(r.model_share), round2(r.cost_per_run),
          round2(r.break_even_price), round2(r.price_for_target),
          r.recommendations.map(function (x) { return x.id; }).join(" ")
        ].map(csvCell).join(",")
      );
    });
    rows.push(
      [
        "portfolio", "Portfolio total", "", p.portfolio_status, round2(p.total_revenue), "", "", round2(p.total_model_cost),
        "", "", "", "", "", "", round2(p.total_delivery_cost), round2(p.total_gross_profit), round1Percent(p.portfolio_margin),
        "", "", "", "", p.red_count + " under warning line"
      ].map(csvCell).join(",")
    );
    return rows.join("\n") + "\n";
  }

  var api = {
    VERSION: VERSION,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    NUMBER_FIELDS: NUMBER_FIELDS,
    computeWorkflow: computeWorkflow,
    computePortfolio: computePortfolio,
    recommend: recommend,
    normalizeWorkflow: normalizeWorkflow,
    normalizeData: normalizeData,
    newWorkflow: newWorkflow,
    sampleData: sampleData,
    toCSV: toCSV,
    currencySymbol: currencySymbol,
    formatMoney: formatMoney,
    formatPercent: formatPercent,
    formatNumber: formatNumber,
    round2: round2,
    round1Percent: round1Percent,
    slugify: slugify
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ProfitEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : this);
