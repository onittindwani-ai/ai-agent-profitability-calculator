# The spreadsheet

`AI-Agent-Profitability-Calculator.xlsx` does the same math as the app, with plain formulas. It works in Excel, Google Sheets and
LibreOffice.

## Open it

- **Excel**: double click the file.
- **Google Sheets**: go to Google Sheets, choose File > Import > Upload, and pick the file. Choose "Create new spreadsheet".
- **LibreOffice**: open the file with LibreOffice Calc.

## The 5 tabs

| Tab | What it does |
| --- | --- |
| Start Here | Short instructions and what each colour means |
| Settings | Your target margin (60 percent) and warning margin (50 percent) |
| Workflows | One column per workflow, up to 10. Your inputs and all the math |
| Dashboard | Totals, portfolio margin, the most and least profitable workflow, a table and a profit chart |
| Recommendations | The fixes the numbers point to, one row per workflow |

## The colours

- **Sand cells** are inputs. Type here.
- **Oat cells** are formulas. Do not type here. They update by themselves.
- **Green** means the margin is at or above your target.
- **Amber** means the margin is under your target, but above the warning line.
- **Red** means the margin is under the warning line. Fix these first.

## The Workflows tab, row by row

The rows follow the 5 parts of the math:

1. **Agent cost tracker**: runs, agent calls per run, tokens per call, token prices, an optional model cost override, infrastructure and
   tools. The token calculator rows show tokens per month and the model cost before retries.
2. **Hidden cost tracker**: retry rate, review hours, upkeep hours and the hourly rate. It shows what retries and human time cost you.
3. **Cost per outcome**: up to 3 outcomes (for example qualified leads and booked meetings). It shows cost, revenue and profit for each one.
4. **Profit and pricing**: delivery cost, gross profit, gross margin, the model share of cost, cost per run, the break even price and the
   price that reaches your target margin.
5. **Status**: mark fixed rule workflows with Yes, and read the green, amber or red status.

## Add a workflow

Type a name in the first empty column. All the formula cells in that column switch on. To remove a workflow, clear its sand cells.

## Tips

- Rates are shares: 0.2 means 20 percent. The sheet stops you from typing a rate above 1.
- If you know your real model bill, type it in the override row. The sheet then splits it into base cost and retries for you.
- Money cells show the $ sign. For another currency, change the cell format. The math stays the same.
- Want a fresh copy? Run `python3 tools/build_workbook.py` (needs `pip install openpyxl`).
