---
name: agent-profitability
description: Audit the real cost and profit margin of AI agent workflows. Use when the user asks to audit AI workflow costs, check the margin or profit of an AI agent, AI SDR, voice agent or automation they sell, find which workflow loses money, or price an AI service. Asks for the numbers in plain questions, writes data/workflows.json, runs tools/margin.py check and report, and explains the top 3 fixes.
---

# Agent profitability audit

You help the user find out how much profit each AI workflow really makes, using the calculator in this repo. All math lives in
`tools/margin.py` (the same math as `app/engine.js`). Never do the math in your head; run the tool.

## Hard rules

- **Never invent the user's numbers.** Every value in `data/workflows.json` comes from the user. If they do not know a value, ask a
  simpler question, suggest where to find it (their provider's usage page, a bill, their logs), or use `model_cost_override` with their
  real monthly model bill. If they still do not know, leave that workflow out and say so.
- **Never send data anywhere.** No web requests, no uploads, no API calls. Everything stays in this folder.
- **Token prices**: use the price per 1M tokens the user gives. The sample prices are example rates, never a real model's price. Do not
  claim to know a provider's current price.
- Plain words, short sentences. No dashes in what you write.

## Steps

1. **Read first.** Open `data/workflows.json`. If it still holds the 3 fictional samples, ask if the user wants to replace them or keep
   them for comparison. Read `docs/04-HOW-THE-MATH-WORKS.md` if you need the formulas.
2. **Ask per workflow, in plain questions**, a few at a time:
   - What is the workflow called, and what does the client pay you for it per month?
   - How many times does it run per month, and how many agent (model) calls does one run make?
   - About how many input and output tokens does one call use? (Or: what is your real monthly model bill for it?)
   - What do you pay per 1M input tokens and per 1M output tokens?
   - About what share of runs fail and run again? (0.2 means 20 percent.)
   - What do servers and automation cost per month for it? Other tools?
   - How many hours a month does someone review the work, and how many on upkeep and fixes? What does that hour cost you?
   - What does the client really pay for (up to 3 outcomes, like qualified leads or booked meetings), and how many per month?
   - Is it fixed rules only (no judgement needed)?
   Also confirm the target margin (default 0.60) and warning margin (default 0.50).
3. **Write `data/workflows.json`** in the format of `data/sample-workflows.json`: top level `currency`, `target_margin`,
   `warning_margin`, `workflows`. Each workflow needs `id` (short, lowercase, words joined with hyphens), `name`, `client` (optional),
   `revenue_monthly`, `runs_monthly`, `agent_calls_per_run`, `input_tokens_per_call`, `output_tokens_per_call`,
   `price_input_per_million`, `price_output_per_million`, `retry_rate`, `model_cost_override` (null or a number),
   `infrastructure_monthly`, `tools_monthly`, `review_hours`, `maintenance_hours`, `hourly_rate`, `rule_based`, `outcomes`.
   When the user gives a monthly model bill instead of tokens, put token fields at 0 and the bill in `model_cost_override`.
4. **Run** `python3 tools/margin.py check`. Fix every problem it lists with the user (never by guessing), then run it again until OK.
5. **Run** `python3 tools/margin.py report`.
6. **Explain** in this order:
   - The portfolio margin and how many workflows are red.
   - For each workflow: what the client pays, the real delivery cost, the gross profit and margin, with the biggest cost named.
   - **The top 3 fixes** across all workflows: red items first, then amber, biggest money first. Use the numbers from the report
     (for example the price that reaches the target, or what retries cost per month). `docs/05-CUT-YOUR-COSTS.md` has the playbook.
7. **Offer the app**: "Want to see it visually? I can run `python3 tools/serve.py`, which opens the app on your computer at
   http://localhost:8765." In the app, the user can import `data/workflows.json` with Import.

## Useful commands

```
python3 tools/margin.py check
python3 tools/margin.py report
python3 tools/margin.py json
python3 tools/margin.py csv > margins.csv
python3 tools/margin.py report --settings target_margin=0.65
python3 tools/serve.py
python3 tools/build_workbook.py   # rebuild the spreadsheet (needs openpyxl)
```

## Remind the user

The result is an estimate from their own numbers, not financial advice (`docs/LIMITS-AND-HONESTY.md`).
