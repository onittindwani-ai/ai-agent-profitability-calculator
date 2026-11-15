# Changelog

## 1.0.0 (2026-11-15)

First release.

- The app: a local web app in `app/` with a portfolio dashboard, workflow cards, a detail editor for the 5 parts of the math,
  import and export (JSON and CSV), a print summary and data saved on your device only.
- The spreadsheet: `AI-Agent-Profitability-Calculator.xlsx` with Start Here, Settings, Workflows (up to 10), Dashboard and
  Recommendations tabs. Built by `tools/build_workbook.py`.
- Claude Code: the `agent-profitability` skill and the `/margin-audit` and `/margin-report` commands.
- `tools/margin.py`: report, json, csv and check commands, standard library only.
- Three fictional sample workflows, including the AI SDR example ($1,500 revenue, $500 delivery cost, 66.7 percent margin).
- Tests: Python unit tests, Node tests for the app engine (both engines must agree to the cent) and a kit check.
