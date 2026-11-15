#!/usr/bin/env python3
"""Build AI-Agent-Profitability-Calculator.xlsx from data/sample-workflows.json.

Needs openpyxl (pip install openpyxl). The workbook uses only plain formulas
(IF, SUM, ROUND, IFERROR, INDEX, MATCH, MAX, MIN, COUNTIF, TEXT, AND, OR) so it
works in Excel, Google Sheets (File > Import) and LibreOffice.

Usage:
  python3 tools/build_workbook.py                 writes the xlsx in the repo root
  python3 tools/build_workbook.py --out my.xlsx   writes somewhere else
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Protection, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = ROOT / "data" / "sample-workflows.json"
OUT = ROOT / "AI-Agent-Profitability-Calculator.xlsx"
MAX_WORKFLOWS = 10
FIRST_COL = 2  # column B

# Palette: warm neutral 60, coffee 30, one accent 10 (same tokens as app/DESIGN-NOTES.md).
CREAM = "F4EEE4"
OAT = "EAE0D0"
SAND = "F3DFBF"      # editable input cells (warm honey sand)
ESPRESSO = "2A1C14"
MOCHA = "5B4031"
LATTE = "9C7B60"
ACCENT = "2D6A62"    # deep teal, healthy (the complement of coffee brown)
AMBER_FILL = "F3D9B1"
RED_FILL = "F2C4BE"
GREEN_FILL = "D8E5D6"
RED_TEXT = "B42318"
AMBER_TEXT = "8A3F20"  # terracotta family

MONEY = '"$"#,##0.00'
PCT = "0.0%"
INT = "#,##0"
DEC = "#,##0.00"

thin = Side(style="thin", color=LATTE)
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)

# (key, label, kind, number format, formula template or sample field)
# kind: section, input, formula. Formula templates use {key} for this column's cell.
ROWS = [
    ("name", "Workflow name", "input", None, "name"),
    ("client", "Client (fictional in the sample)", "input", None, "client"),
    ("revenue", "Client pays per month", "input", MONEY, "revenue_monthly"),
    ("s1", "1. AGENT COST TRACKER", "section", None, None),
    ("runs", "Runs per month", "input", INT, "runs_monthly"),
    ("calls", "Agent calls per run", "input", DEC, "agent_calls_per_run"),
    ("tin", "Input tokens per call", "input", INT, "input_tokens_per_call"),
    ("tout", "Output tokens per call", "input", INT, "output_tokens_per_call"),
    ("pin", "Price per 1M input tokens (example rate)", "input", MONEY, "price_input_per_million"),
    ("pout", "Price per 1M output tokens (example rate)", "input", MONEY, "price_output_per_million"),
    ("override", "Model cost override per month (optional, from your bill)", "input", MONEY, "model_cost_override"),
    ("infra", "Automation and infrastructure per month", "input", MONEY, "infrastructure_monthly"),
    ("tools", "Other tools per month", "input", MONEY, "tools_monthly"),
    ("tokens", "Token calculator: tokens per month", "formula", INT,
     'IF({name}="","",{runs}*{calls}*({tin}+{tout}))'),
    ("tokencost", "Token calculator: model cost before retries", "formula", MONEY,
     'IF({name}="","",{runs}*{calls}*({tin}*{pin}+{tout}*{pout})/1000000)'),
    ("base", "AI model cost (base)", "formula", MONEY,
     'IF({name}="","",IF({override}<>"",{override}/(1+{retry}),{tokencost}))'),
    ("agent", "Agent costs total", "formula", MONEY, 'IF({name}="","",{base}+{infra}+{tools})'),
    ("s2", "2. HIDDEN COST TRACKER", "section", None, None),
    ("retry", "Retry rate (0.2 means 20 percent)", "input", "0%", "retry_rate"),
    ("review_h", "Human review hours per month", "input", DEC, "review_hours"),
    ("maint_h", "Upkeep and fixes hours per month", "input", DEC, "maintenance_hours"),
    ("rate", "Hourly rate for that time", "input", MONEY, "hourly_rate"),
    ("retrycost", "Retry cost", "formula", MONEY,
     'IF({name}="","",IF({override}<>"",{override}-{base},{base}*{retry}))'),
    ("reviewcost", "Human review cost", "formula", MONEY, 'IF({name}="","",{review_h}*{rate})'),
    ("maintcost", "Upkeep cost", "formula", MONEY, 'IF({name}="","",{maint_h}*{rate})'),
    ("hidden", "Hidden costs total", "formula", MONEY, 'IF({name}="","",{retrycost}+{reviewcost}+{maintcost})'),
    ("modelcost", "AI model cost incl. retries", "formula", MONEY, 'IF({name}="","",{base}+{retrycost})'),
    ("s3", "3. COST PER OUTCOME", "section", None, None),
    ("o1n", "Outcome 1 name", "input", None, ("outcome", 0, "name")),
    ("o1c", "Outcome 1 count per month", "input", INT, ("outcome", 0, "count")),
    ("o1cost", "Outcome 1: cost each", "formula", MONEY, 'IF(OR({name}="",N({o1c})=0),"",{delivery}/{o1c})'),
    ("o1rev", "Outcome 1: revenue each", "formula", MONEY, 'IF(OR({name}="",N({o1c})=0),"",{revenue}/{o1c})'),
    ("o1pro", "Outcome 1: profit each", "formula", MONEY, 'IF(OR({name}="",N({o1c})=0),"",{profit}/{o1c})'),
    ("o2n", "Outcome 2 name", "input", None, ("outcome", 1, "name")),
    ("o2c", "Outcome 2 count per month", "input", INT, ("outcome", 1, "count")),
    ("o2cost", "Outcome 2: cost each", "formula", MONEY, 'IF(OR({name}="",N({o2c})=0),"",{delivery}/{o2c})'),
    ("o2rev", "Outcome 2: revenue each", "formula", MONEY, 'IF(OR({name}="",N({o2c})=0),"",{revenue}/{o2c})'),
    ("o2pro", "Outcome 2: profit each", "formula", MONEY, 'IF(OR({name}="",N({o2c})=0),"",{profit}/{o2c})'),
    ("o3n", "Outcome 3 name", "input", None, ("outcome", 2, "name")),
    ("o3c", "Outcome 3 count per month", "input", INT, ("outcome", 2, "count")),
    ("o3cost", "Outcome 3: cost each", "formula", MONEY, 'IF(OR({name}="",N({o3c})=0),"",{delivery}/{o3c})'),
    ("o3rev", "Outcome 3: revenue each", "formula", MONEY, 'IF(OR({name}="",N({o3c})=0),"",{revenue}/{o3c})'),
    ("o3pro", "Outcome 3: profit each", "formula", MONEY, 'IF(OR({name}="",N({o3c})=0),"",{profit}/{o3c})'),
    ("s4", "4. PROFIT AND PRICING", "section", None, None),
    ("delivery", "Delivery cost per month", "formula", MONEY, 'IF({name}="","",{agent}+{hidden})'),
    ("profit", "Gross profit per month", "formula", MONEY, 'IF({name}="","",{revenue}-{delivery})'),
    ("margin", "Gross margin", "formula", PCT, 'IF(OR({name}="",N({revenue})=0),"",{profit}/{revenue})'),
    ("share", "AI model share of delivery cost", "formula", PCT,
     'IF({name}="","",IF({delivery}=0,0,{modelcost}/{delivery}))'),
    ("perrun", "Cost per run", "formula", MONEY, 'IF(OR({name}="",N({runs})=0),"",{delivery}/{runs})'),
    ("breakeven", "Break even price (profit is zero)", "formula", MONEY, 'IF({name}="","",{delivery})'),
    ("pricetarget", "Price that reaches your target margin", "formula", MONEY,
     'IF({name}="","",{delivery}/(1-{target}))'),
    ("s5", "5. STATUS", "section", None, None),
    ("rule", "Fixed rules only, no judgement needed? (Yes or No)", "input", None, "rule_based"),
    ("status", "Status (green, amber or red)", "formula", None,
     'IF({name}="","",IF({margin}="","red",IF({margin}<{warn},"red",IF({margin}<{target},"amber","green"))))'),
]
ROW_OF = {}
_r = 5
for _key, *_rest in ROWS:
    ROW_OF[_key] = _r
    _r += 1
LAST_ROW = _r - 1


def fill(color):
    return PatternFill("solid", start_color=color, end_color=color)


def cell_refs(col_letter, sheet_prefix=""):
    refs = {key: f"{sheet_prefix}{col_letter}{row}" for key, row in ROW_OF.items()}
    refs["target"] = "Settings!$B$4"
    refs["warn"] = "Settings!$B$5"
    return refs


def load_sample():
    if not SAMPLE.exists():
        raise SystemExit(f"Missing {SAMPLE}. The workbook is prefilled from the sample workflows.")
    return json.loads(SAMPLE.read_text(encoding="utf-8"))


def sample_value(wf, source):
    if isinstance(source, tuple):
        _, index, field = source
        outcomes = wf.get("outcomes") or []
        return outcomes[index][field] if index < len(outcomes) else None
    value = wf.get(source)
    if source == "rule_based":
        return "Yes" if value else "No"
    return value


# ---------------------------------------------------------------- sheets


def style_title(ws, text, subtitle):
    ws["A1"] = text
    ws["A1"].font = Font(name="Georgia", size=18, bold=True, color=ESPRESSO)
    ws["A2"] = subtitle
    ws["A2"].font = Font(size=10, italic=True, color=MOCHA)
    ws.sheet_properties.tabColor = MOCHA


def paint_background(ws, max_row, max_col):
    for row in ws.iter_rows(min_row=1, max_row=max_row, min_col=1, max_col=max_col):
        for cell in row:
            if cell.fill.fill_type is None:
                cell.fill = fill(CREAM)


def build_start(wb):
    ws = wb.active
    ws.title = "Start Here"
    style_title(ws, "AI Agent Profitability Calculator", "Find out how much profit each AI workflow really makes.")
    lines = [
        ("How to use it", True),
        ("1. Open the Settings tab and set your target margin and your warning margin.", False),
        ("2. Open the Workflows tab. Each column is one workflow (up to 10). Type only in the sand coloured cells.", False),
        ("3. Use the model cost override row if you know the real monthly model bill. Leave it empty to use the token calculator.", False),
        ("4. Open the Dashboard tab for totals, portfolio margin and a profit chart.", False),
        ("5. Open the Recommendations tab for the fixes the numbers point to.", False),
        ("", False),
        ("What the colours mean", True),
        ("Sand cells: your inputs. Type here.", "input"),
        ("Oat cells: formulas. Do not type here, they update by themselves.", "formula"),
        ("Green: margin at or above your target.", "green"),
        ("Amber: margin under your target but above your warning line.", "amber"),
        ("Red: margin under your warning line (50 percent by default). Fix these first.", "red"),
        ("", False),
        ("Good to know", True),
        ("The three sample workflows and their clients are fictional. Replace them with your own numbers.", False),
        ("Token prices are example rates. Replace them with your provider's current price per 1M tokens.", False),
        ("Everything stays in this file on your device. Nothing is sent anywhere.", False),
        ("This is an estimate to help you decide, not financial advice.", False),
        ("Google Sheets: File > Import > Upload this file. All formulas work there too.", False),
        ("Free resource, MIT licence. Repo: https://github.com/onittindwani-ai/ai-agent-profitability-calculator", False),
    ]
    swatch = {"input": SAND, "formula": OAT, "green": GREEN_FILL, "amber": AMBER_FILL, "red": RED_FILL}
    for offset, (text, kind) in enumerate(lines, start=4):
        cell = ws.cell(row=offset, column=1, value=text)
        if kind is True:
            cell.font = Font(name="Georgia", size=13, bold=True, color=MOCHA)
        else:
            cell.font = Font(size=11, color=ESPRESSO)
        if kind in swatch:
            cell.fill = fill(swatch[kind])
    ws.column_dimensions["A"].width = 118
    paint_background(ws, 30, 3)


def build_settings(wb, data):
    ws = wb.create_sheet("Settings")
    style_title(ws, "Settings", "These apply to every workflow.")
    header(ws, 3, ["Setting", "Value", "What it means"])
    rows = [
        ("Target margin", data.get("target_margin", 0.6), PCT, "The share of revenue you want to keep as gross profit."),
        ("Warning margin", data.get("warning_margin", 0.5), PCT, "Under this line a workflow turns red."),
        ("Currency", data.get("currency", "USD"), None, "Label only. Money cells show the $ sign; change the cell format for another currency."),
    ]
    for offset, (label, value, fmt, note) in enumerate(rows, start=4):
        ws.cell(row=offset, column=1, value=label).font = Font(bold=True, color=ESPRESSO)
        cell = ws.cell(row=offset, column=2, value=value)
        style_input(cell, fmt)
        ws.cell(row=offset, column=3, value=note).font = Font(size=10, color=MOCHA)
    rate = DataValidation(type="decimal", operator="between", formula1="0", formula2="0.99", allow_blank=False)
    rate.error = "Use a share between 0 and 0.99, for example 0.6 for 60 percent."
    rate.errorTitle = "Margin out of range"
    ws.add_data_validation(rate)
    rate.add("B4:B5")
    ws.column_dimensions["A"].width = 20
    ws.column_dimensions["B"].width = 14
    ws.column_dimensions["C"].width = 80
    ws.freeze_panes = "A4"
    paint_background(ws, 12, 4)


def header(ws, row, labels, start_col=1):
    for offset, label in enumerate(labels):
        cell = ws.cell(row=row, column=start_col + offset, value=label)
        cell.font = Font(bold=True, color=CREAM)
        cell.fill = fill(ESPRESSO)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = BORDER


def style_input(cell, fmt):
    cell.fill = fill(SAND)
    cell.font = Font(color=ESPRESSO)
    cell.border = BORDER
    cell.protection = Protection(locked=False)
    if fmt:
        cell.number_format = fmt


def style_formula(cell, fmt):
    cell.fill = fill(OAT)
    cell.font = Font(color=ESPRESSO, bold=False)
    cell.border = BORDER
    if fmt:
        cell.number_format = fmt


def build_workflows(wb, data):
    ws = wb.create_sheet("Workflows")
    style_title(ws, "Workflows", "One column per workflow. Type only in the sand cells. Prices are example rates.")
    header(ws, 4, ["Field"] + [f"Workflow {n}" for n in range(1, MAX_WORKFLOWS + 1)])
    samples = data.get("workflows", [])[:MAX_WORKFLOWS]
    for key, label, kind, fmt, source in ROWS:
        row = ROW_OF[key]
        label_cell = ws.cell(row=row, column=1, value=label)
        if kind == "section":
            for col in range(1, FIRST_COL + MAX_WORKFLOWS):
                c = ws.cell(row=row, column=col)
                c.fill = fill(MOCHA)
                c.font = Font(bold=True, color=CREAM)
            continue
        label_cell.font = Font(color=ESPRESSO, bold=kind == "formula" and key in ("delivery", "profit", "margin", "status"))
        label_cell.fill = fill(CREAM)
        label_cell.border = BORDER
        for index in range(MAX_WORKFLOWS):
            col = FIRST_COL + index
            letter = get_column_letter(col)
            cell = ws.cell(row=row, column=col)
            if kind == "input":
                if index < len(samples):
                    cell.value = sample_value(samples[index], source)
                style_input(cell, fmt)
            else:
                cell.value = "=" + source.format(**cell_refs(letter))
                style_formula(cell, fmt)
    add_workflow_validation(ws)
    add_status_colours(ws)
    ws.column_dimensions["A"].width = 52
    for index in range(MAX_WORKFLOWS):
        ws.column_dimensions[get_column_letter(FIRST_COL + index)].width = 22
    ws.freeze_panes = "B5"
    paint_background(ws, LAST_ROW + 2, FIRST_COL + MAX_WORKFLOWS)


def col_range(key):
    row = ROW_OF[key]
    return f"B{row}:{get_column_letter(FIRST_COL + MAX_WORKFLOWS - 1)}{row}"


def add_workflow_validation(ws):
    rate = DataValidation(type="decimal", operator="between", formula1="0", formula2="1", allow_blank=True)
    rate.error = "Use a share between 0 and 1, for example 0.2 for 20 percent."
    rate.errorTitle = "Rate out of range"
    ws.add_data_validation(rate)
    rate.add(col_range("retry"))

    positive = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True)
    positive.error = "Use 0 or more."
    positive.errorTitle = "Negative number"
    ws.add_data_validation(positive)
    for key in ("revenue", "runs", "calls", "tin", "tout", "pin", "pout", "override", "infra", "tools",
                "review_h", "maint_h", "rate", "o1c", "o2c", "o3c"):
        positive.add(col_range(key))

    yes_no = DataValidation(type="list", formula1='"Yes,No"', allow_blank=True)
    ws.add_data_validation(yes_no)
    yes_no.add(col_range("rule"))


def add_status_colours(ws):
    status = col_range("status")
    first = f"B{ROW_OF['status']}"
    for word, bg, fg in (("red", RED_FILL, RED_TEXT), ("amber", AMBER_FILL, AMBER_TEXT), ("green", GREEN_FILL, ACCENT)):
        ws.conditional_formatting.add(
            status, FormulaRule(formula=[f'{first}="{word}"'], fill=fill(bg), font=Font(bold=True, color=fg))
        )


def build_dashboard(wb):
    ws = wb.create_sheet("Dashboard")
    style_title(ws, "Dashboard", "Agency profit at a glance. Everything here is a formula.")
    last = get_column_letter(FIRST_COL + MAX_WORKFLOWS - 1)

    def wrow(key):
        return f"Workflows!$B${ROW_OF[key]}:${last}${ROW_OF[key]}"

    totals = [
        ("Total revenue per month", f"=SUM({wrow('revenue')})", MONEY),
        ("Total delivery cost", f"=SUM({wrow('delivery')})", MONEY),
        ("Total gross profit", f"=SUM({wrow('profit')})", MONEY),
        ("Portfolio margin", "=IFERROR(B6/B4,\"\")", PCT),
        ("Workflows in red", f"=COUNTIF({wrow('status')},\"red\")", "0"),
        ("Most profitable (by margin)", "=IFERROR(INDEX($B$14:$B$23,MATCH(MAX($F$14:$F$23),$F$14:$F$23,0)),\"\")", None),
        ("Least profitable (by margin)", "=IFERROR(INDEX($B$14:$B$23,MATCH(MIN($F$14:$F$23),$F$14:$F$23,0)),\"\")", None),
    ]
    for offset, (label, formula, fmt) in enumerate(totals, start=4):
        ws.cell(row=offset, column=1, value=label).font = Font(bold=True, color=ESPRESSO)
        cell = ws.cell(row=offset, column=2, value=formula)
        style_formula(cell, fmt)
        cell.font = Font(name="Georgia", size=13, bold=True, color=ESPRESSO)
    ws["D4"], ws["E4"] = "Target margin", "=Settings!B4"
    ws["D5"], ws["E5"] = "Warning margin", "=Settings!B5"
    for ref in ("E4", "E5"):
        style_formula(ws[ref], PCT)
    for ref in ("D4", "D5"):
        ws[ref].font = Font(color=MOCHA)

    header(ws, 13, ["#", "Workflow", "Revenue", "Delivery cost", "Gross profit", "Gross margin", "Status"])
    for index in range(MAX_WORKFLOWS):
        row = 14 + index
        letter = get_column_letter(FIRST_COL + index)
        values = [
            (index + 1, "0"),
            (f'=IF(Workflows!{letter}{ROW_OF["name"]}="","",Workflows!{letter}{ROW_OF["name"]})', None),
            (f"=Workflows!{letter}{ROW_OF['revenue']}", MONEY),
            (f"=Workflows!{letter}{ROW_OF['delivery']}", MONEY),
            (f"=Workflows!{letter}{ROW_OF['profit']}", MONEY),
            (f"=Workflows!{letter}{ROW_OF['margin']}", PCT),
            (f"=Workflows!{letter}{ROW_OF['status']}", None),
        ]
        values[2] = (f'=IF(B{row}="","",Workflows!{letter}{ROW_OF["revenue"]})', MONEY)
        for col, (value, fmt) in enumerate(values, start=1):
            style_formula(ws.cell(row=row, column=col, value=value), fmt)
    margins = "F14:F23"
    ws.conditional_formatting.add(
        margins, FormulaRule(formula=["AND(ISNUMBER(F14),F14<$E$5)"], fill=fill(RED_FILL), font=Font(bold=True, color=RED_TEXT))
    )
    ws.conditional_formatting.add(
        margins, FormulaRule(formula=["AND(ISNUMBER(F14),F14<$E$4)"], fill=fill(AMBER_FILL), font=Font(color=AMBER_TEXT))
    )
    ws.conditional_formatting.add(
        margins, FormulaRule(formula=["AND(ISNUMBER(F14),F14>=$E$4)"], fill=fill(GREEN_FILL), font=Font(color=ACCENT))
    )
    ws.conditional_formatting.add(
        "B7", FormulaRule(formula=["AND(ISNUMBER(B7),B7<$E$5)"], fill=fill(RED_FILL), font=Font(bold=True, color=RED_TEXT))
    )
    for word, bg, fg in (("red", RED_FILL, RED_TEXT), ("amber", AMBER_FILL, AMBER_TEXT), ("green", GREEN_FILL, ACCENT)):
        ws.conditional_formatting.add("G14:G23", FormulaRule(formula=[f'G14="{word}"'], fill=fill(bg), font=Font(bold=True, color=fg)))

    chart = BarChart()
    chart.type = "bar"
    chart.style = 2
    chart.title = "Gross profit per workflow"
    chart.y_axis.title = "Profit per month"
    chart.legend = None
    chart.add_data(Reference(ws, min_col=5, min_row=13, max_row=23), titles_from_data=True)
    chart.set_categories(Reference(ws, min_col=2, min_row=14, max_row=23))
    chart.series[0].graphicalProperties.solidFill = MOCHA
    chart.series[0].graphicalProperties.line.solidFill = ESPRESSO
    chart.height, chart.width = 9, 18
    ws.add_chart(chart, "I3")

    widths = {"A": 30, "B": 30, "C": 16, "D": 16, "E": 16, "F": 14, "G": 12}
    for letter, width in widths.items():
        ws.column_dimensions[letter].width = width
    ws.freeze_panes = "A4"
    paint_background(ws, 26, 8)


def build_recommendations(wb):
    ws = wb.create_sheet("Recommendations")
    style_title(ws, "Recommendations", "Formula driven. A cell stays empty when its rule does not apply.")
    titles = [
        "Workflow", "Status", "1. Margin under warning", "2. Margin under target", "3. Model heavy",
        "4. Retries high", "5. Chatty agents", "6. Review heavy", "7. Use simple automation",
        "8. Losing per outcome", "All clear",
    ]
    header(ws, 4, titles)
    for index in range(MAX_WORKFLOWS):
        row = 5 + index
        letter = get_column_letter(FIRST_COL + index)
        r = cell_refs(letter, "Workflows!")
        n = r["name"]
        money = lambda key: f'"$"&TEXT({r[key]},"#,##0.00")'  # noqa: E731
        pct = lambda ref: f'TEXT({ref},"0.0%")'  # noqa: E731
        rules = [
            f'IF({n}="","",{n})',
            f'IF({n}="","",{r["status"]})',
            f'IF({n}="","",IF(OR({r["margin"]}="",N({r["margin"]})<{r["warn"]}),"Margin is under "&{pct(r["warn"])}'
            f'&". Charge about "&{money("pricetarget")}&" a month to reach your "&{pct(r["target"])}&" target, or cut cost.",""))',
            f'IF({n}="","",IF(AND({r["margin"]}<>"",N({r["margin"]})>={r["warn"]},N({r["margin"]})<{r["target"]}),'
            f'"Margin is under your "&{pct(r["target"])}&" target. Charge about "&{money("pricetarget")}&" a month.",""))',
            f'IF({n}="","",IF(N({r["share"]})>0.4,"The AI model is "&{pct(r["share"])}&" of your cost. Route simple '
            f'steps to a cheaper model, trim the context, cache what repeats.",""))',
            f'IF({n}="","",IF(N({r["retry"]})>0.15,"Retries cost "&{money("retrycost")}&" a month. Fix the failing '
            f'step before you scale.",""))',
            f'IF({n}="","",IF(N({r["calls"]})>4,"Each run makes "&{r["calls"]}&" agent calls. Merge steps or cut '
            f'hand offs.",""))',
            f'IF({n}="","",IF((N({r["review_h"]})+N({r["maint_h"]}))/MAX(N({r["o1c"]})+N({r["o2c"]})+N({r["o3c"]}),1)>0.25,'
            f'"Human time per result is high. Spot check instead of reviewing every item.",""))',
            f'IF({n}="","",IF({r["rule"]}="Yes","Fixed rule steps can often run as plain automation with no '
            f'token cost.",""))',
            f'IF({n}="","",IF(AND(N({r["o1c"]})+N({r["o2c"]})+N({r["o3c"]})>0,N({r["profit"]})<0),"Each result costs '
            f'more to deliver than it brings in. Raise the price or cut cost before adding volume.",""))',
        ]
        rules.append(
            f'IF({n}="","",IF(AND(C{row}="",D{row}="",E{row}="",F{row}="",G{row}="",H{row}="",I{row}="",J{row}=""),'
            f'"Healthy: at or above your target and no cost warning.",""))'
        )
        for col, formula in enumerate(rules, start=1):
            cell = ws.cell(row=row, column=col, value="=" + formula)
            style_formula(cell, None)
            cell.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[row].height = 62
    for word, bg, fg in (("red", RED_FILL, RED_TEXT), ("amber", AMBER_FILL, AMBER_TEXT), ("green", GREEN_FILL, ACCENT)):
        ws.conditional_formatting.add("B5:B14", FormulaRule(formula=[f'B5="{word}"'], fill=fill(bg), font=Font(bold=True, color=fg)))
    ws.column_dimensions["A"].width = 26
    ws.column_dimensions["B"].width = 10
    for col in range(3, 12):
        ws.column_dimensions[get_column_letter(col)].width = 30
    ws.freeze_panes = "C5"
    paint_background(ws, 16, 11)


def build(out=OUT):
    data = load_sample()
    wb = Workbook()
    build_start(wb)
    build_settings(wb, data)
    build_workflows(wb, data)
    build_dashboard(wb)
    build_recommendations(wb)
    wb.calculation.fullCalcOnLoad = True
    wb.save(out)
    return out


def main():
    parser = argparse.ArgumentParser(description="Build the AI Agent Profitability Calculator workbook.")
    parser.add_argument("--out", default=str(OUT), help="where to write the xlsx")
    args = parser.parse_args()
    path = build(Path(args.out))
    print(f"Wrote {path}")


if __name__ == "__main__":
    main()
