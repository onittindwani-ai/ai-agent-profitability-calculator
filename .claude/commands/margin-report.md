---
description: Run the margin report on your saved workflows and explain the top 3 fixes
---

1. Run `python3 tools/margin.py check`. If it finds problems, list them in plain words and ask me how to fix them. Do not guess values.
2. Run `python3 tools/margin.py report` (add `--file <path>` if I name another file).
3. Explain, in plain words and no dashes:
   - the portfolio margin and the number of red workflows,
   - for each workflow: revenue, real delivery cost, gross profit, margin and its biggest cost,
   - the top 3 fixes across all workflows, red first, biggest money first, with the numbers from the report.
4. Point me to `docs/05-CUT-YOUR-COSTS.md` for how to make each fix.
5. Offer to open the app with `python3 tools/serve.py`.

Remind me this is an estimate from my numbers, not financial advice.

$ARGUMENTS
