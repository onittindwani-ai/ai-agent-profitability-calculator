// Tests for app/engine.js. Run with: node --test tests/
// They assert the same fixture as tests/test_margin.py, so the app and the
// command line tool must agree to the cent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const require = createRequire(import.meta.url);

function loadEngine() {
  const mod = require(path.join(root, "app", "engine.js"));
  const engine = mod && mod.computeWorkflow ? mod : globalThis.ProfitEngine;
  assert.ok(engine && engine.computeWorkflow, "app/engine.js must expose computeWorkflow");
  return engine;
}

const engine = loadEngine();
const expected = JSON.parse(readFileSync(path.join(here, "fixtures", "expected.json"), "utf8"));
const sample = () => JSON.parse(readFileSync(path.join(root, "data", "sample-workflows.json"), "utf8"));
const SHARES = new Set(["gross_margin", "model_share", "portfolio_margin"]);
const cents = (v) => Math.round(v * 100) / 100;

function assertValue(key, actual, want, label) {
  const msg = `${label} ${key}: got ${actual}, want ${want}`;
  if (want === null) return assert.equal(actual, null, msg);
  if (typeof want === "string") return assert.equal(actual, want, msg);
  if (SHARES.has(key)) return assert.ok(Math.abs(actual - want) < 1e-5, msg);
  assert.equal(cents(actual), cents(want), msg);
}

const portfolio = engine.computePortfolio(sample());
const byId = Object.fromEntries(portfolio.workflows.map((r) => [r.id, r]));

test("every per workflow number matches the fixture", () => {
  for (const [id, exp] of Object.entries(expected.workflows)) {
    assert.ok(byId[id], `missing workflow ${id}`);
    for (const [key, want] of Object.entries(exp)) {
      if (key === "outcomes" || key === "recommendation_ids") continue;
      assertValue(key, byId[id][key], want, id);
    }
  }
});

test("cost per outcome matches", () => {
  for (const [id, exp] of Object.entries(expected.workflows)) {
    const got = byId[id].outcomes;
    assert.equal(got.length, exp.outcomes.length, id);
    exp.outcomes.forEach((want, i) => {
      assert.equal(got[i].name, want.name);
      for (const key of ["cost_per_outcome", "revenue_per_outcome", "profit_per_outcome"]) {
        assertValue(key, got[i][key], want[key], `${id} ${want.name}`);
      }
    });
  }
});

test("recommendation ids and order match", () => {
  for (const [id, exp] of Object.entries(expected.workflows)) {
    assert.deepEqual(
      byId[id].recommendations.map((r) => r.id),
      exp.recommendation_ids,
      id
    );
  }
});

test("recommendation text is complete and has no dashes", () => {
  for (const r of portfolio.workflows) {
    for (const rec of r.recommendations) {
      assert.ok(["red", "amber", "info"].includes(rec.severity), rec.id);
      assert.ok(rec.title && rec.detail, rec.id);
      assert.ok(!/[\u2013\u2014]/.test(rec.title + rec.detail), `dash in ${rec.id}`);
    }
  }
});

test("portfolio matches", () => {
  const exp = expected.portfolio;
  for (const key of ["total_revenue", "total_delivery_cost", "total_gross_profit", "portfolio_margin"]) {
    assertValue(key, portfolio[key], exp[key], "portfolio");
  }
  assert.equal(portfolio.red_count, exp.red_count);
  assert.equal(portfolio.most_profitable.id, exp.most_profitable_id);
  assert.equal(portfolio.least_profitable.id, exp.least_profitable_id);
});

function edge(name) {
  const c = expected.edge_cases[name];
  const data = sample();
  const wf = { ...data.workflows.find((w) => w.id === c.base_workflow), ...c.input };
  return [engine.computeWorkflow(wf, expected.settings), c.expected];
}

test("model cost override", () => {
  const [r, exp] = edge("override");
  for (const [key, want] of Object.entries(exp)) assertValue(key, r[key], want, "override");
});

test("zero revenue gives no margin and a red status", () => {
  const [r, exp] = edge("zero_revenue");
  assert.equal(r.gross_margin, null);
  assertValue("delivery_cost", r.delivery_cost, exp.delivery_cost, "zero revenue");
  assertValue("gross_profit", r.gross_profit, exp.gross_profit, "zero revenue");
  assert.equal(r.status, "red");
  assert.equal(r.recommendations[0].id, "margin_below_warning");
});

test("zero outcome count gives empty per outcome numbers", () => {
  const [r, exp] = edge("zero_outcomes");
  for (const [key, want] of Object.entries(exp)) assert.equal(r.outcomes[0][key], want, key);
  assert.ok(!r.recommendations.some((x) => x.id === "losing_per_outcome"));
});

test("amber band and model heavy rules agree with the Python engine", () => {
  const data = sample();
  const sdr = { ...data.workflows[0], revenue_monthly: 1100 };
  const amber = engine.computeWorkflow(sdr, expected.settings);
  assert.equal(amber.status, "amber");
  assert.equal(amber.recommendations[0].id, "margin_below_target");

  const inbox = { ...data.workflows[2], model_cost_override: 2000 };
  const heavy = engine.computeWorkflow(inbox, expected.settings);
  assert.deepEqual(
    heavy.recommendations.map((x) => x.id),
    ["margin_below_warning", "model_heavy", "losing_per_outcome"]
  );
});

test("display rounding matches", () => {
  for (const [id, exp] of Object.entries(expected.display)) {
    if (id === "portfolio") {
      assert.equal(engine.formatPercent(portfolio.portfolio_margin, 1), exp.portfolio_margin);
    } else {
      assert.equal(engine.formatPercent(byId[id].gross_margin, 1), exp.gross_margin);
    }
  }
});
