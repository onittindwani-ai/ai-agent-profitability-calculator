#!/usr/bin/env python3
"""AI Agent Profitability Calculator, command line version.

Reads a workflows JSON file (default data/workflows.json) and works out how
much profit each AI workflow really makes. Standard library only. Nothing is
sent anywhere; the file never leaves your computer.

Commands:
  report   readable table per workflow, the portfolio, and recommendations
  json     the same results as machine readable JSON
  csv      one row per workflow, ready for a spreadsheet
  check    validate the JSON file and explain any problem in plain words

Examples:
  python3 tools/margin.py report
  python3 tools/margin.py report --file data/sample-workflows.json
  python3 tools/margin.py json --settings target_margin=0.65,warning_margin=0.5
  python3 tools/margin.py check

The math here matches app/engine.js to the cent. See docs/04-HOW-THE-MATH-WORKS.md.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import sys
from pathlib import Path

VERSION = "1.0.0"
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FILE = ROOT / "data" / "workflows.json"

DEFAULT_SETTINGS = {"currency": "USD", "target_margin": 0.60, "warning_margin": 0.50}

REQUIRED_NUMBERS = (
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
    "hourly_rate",
)

# Thresholds for the recommendations (same values as app/engine.js).
MODEL_HEAVY_SHARE = 0.40
RETRIES_HIGH_RATE = 0.15
CHATTY_CALLS = 4
REVIEW_HOURS_PER_OUTCOME = 0.25

CURRENCY_SYMBOLS = {"USD": "$", "EUR": "€", "GBP": "£", "INR": "₹", "AUD": "A$", "CAD": "C$"}


class DataError(Exception):
    """Raised when the workflows file cannot be used."""


# ---------------------------------------------------------------- formatting


def money(value, currency="USD"):
    if value is None:
        return "n/a"
    symbol = CURRENCY_SYMBOLS.get(currency)
    sign = "-" if value < 0 else ""
    body = f"{abs(value):,.2f}"
    return f"{sign}{symbol}{body}" if symbol else f"{sign}{currency} {body}"


def pct(value):
    if value is None:
        return "n/a"
    return f"{value * 100:.1f}%"


def num(value):
    """Short number for text: 4 instead of 4.0, 2.5 stays 2.5."""
    if value is None:
        return "n/a"
    if float(value).is_integer():
        return f"{int(value):,}"
    return f"{value:,.2f}".rstrip("0").rstrip(".")


# ---------------------------------------------------------------- math


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def compute_workflow(wf, settings):
    """Return every number for one workflow (full precision, no rounding)."""
    target = settings["target_margin"]
    warning = settings["warning_margin"]
    retry_rate = wf["retry_rate"]

    override = wf.get("model_cost_override")
    if is_number(override):
        model_cost = float(override)
        model_base = model_cost / (1 + retry_rate)
        retry_cost = model_cost - model_base
    else:
        per_call = (
            wf["input_tokens_per_call"] * wf["price_input_per_million"]
            + wf["output_tokens_per_call"] * wf["price_output_per_million"]
        )
        model_base = wf["runs_monthly"] * wf["agent_calls_per_run"] * per_call / 1_000_000
        retry_cost = model_base * retry_rate
        model_cost = model_base + retry_cost

    review_cost = wf["review_hours"] * wf["hourly_rate"]
    maintenance_cost = wf["maintenance_hours"] * wf["hourly_rate"]
    agent_costs = model_base + wf["infrastructure_monthly"] + wf["tools_monthly"]
    hidden_costs = retry_cost + review_cost + maintenance_cost
    delivery_cost = agent_costs + hidden_costs
    revenue = wf["revenue_monthly"]
    gross_profit = revenue - delivery_cost
    gross_margin = gross_profit / revenue if revenue else None
    model_share = model_cost / delivery_cost if delivery_cost else 0
    cost_per_run = delivery_cost / wf["runs_monthly"] if wf["runs_monthly"] else None

    outcomes = []
    for outcome in wf.get("outcomes") or []:
        count = outcome.get("count", 0)
        outcomes.append(
            {
                "name": outcome.get("name", "Outcome"),
                "count": count,
                "cost_per_outcome": delivery_cost / count if count else None,
                "revenue_per_outcome": revenue / count if count else None,
                "profit_per_outcome": gross_profit / count if count else None,
            }
        )

    if gross_margin is None or gross_margin < warning:
        status = "red"
    elif gross_margin < target:
        status = "amber"
    else:
        status = "green"

    result = {
        "id": wf["id"],
        "name": wf["name"],
        "client": wf.get("client", ""),
        "revenue_monthly": revenue,
        "model_base": model_base,
        "retry_cost": retry_cost,
        "model_cost": model_cost,
        "infrastructure_monthly": wf["infrastructure_monthly"],
        "tools_monthly": wf["tools_monthly"],
        "review_cost": review_cost,
        "maintenance_cost": maintenance_cost,
        "agent_costs": agent_costs,
        "hidden_costs": hidden_costs,
        "delivery_cost": delivery_cost,
        "gross_profit": gross_profit,
        "gross_margin": gross_margin,
        "model_share": model_share,
        "cost_per_run": cost_per_run,
        "outcomes": outcomes,
        "break_even_price": delivery_cost,
        "price_for_target": delivery_cost / (1 - target),
        "status": status,
    }
    result["recommendations"] = recommendations(wf, result, settings)
    return result


def recommendations(wf, r, settings):
    """The 8 rules, in the fixed order. Returns a list of dicts."""
    cur = settings["currency"]
    target = settings["target_margin"]
    warning = settings["warning_margin"]
    margin = r["gross_margin"]
    out = []

    def add(rec_id, severity, title, detail):
        out.append({"id": rec_id, "severity": severity, "title": title, "detail": detail})

    if margin is None or margin < warning:
        kept = "no revenue yet" if margin is None else f"{pct(margin)} of its revenue"
        add(
            "margin_below_warning",
            "red",
            f"Margin is under {pct(warning)}",
            f"This workflow keeps {kept}. To reach your {pct(target)} target, charge about "
            f"{money(r['price_for_target'], cur)} a month, or cut what it costs you to deliver.",
        )
    elif margin < target:
        gap = r["delivery_cost"] - r["revenue_monthly"] * (1 - target)
        add(
            "margin_below_target",
            "amber",
            f"Margin is under your {pct(target)} target",
            f"This workflow keeps {pct(margin)} of its revenue. Charge about "
            f"{money(r['price_for_target'], cur)} a month, or cut {money(gap, cur)} of monthly cost.",
        )

    if r["model_share"] > MODEL_HEAVY_SHARE:
        add(
            "model_heavy",
            "amber",
            f"The AI model is {pct(r['model_share'])} of your cost",
            f"The model costs {money(r['model_cost'], cur)} a month. Route simple steps to a cheaper model, "
            "trim the context you send, and cache what repeats.",
        )

    if wf["retry_rate"] > RETRIES_HIGH_RATE:
        add(
            "retries_high",
            "amber",
            "Retries are high",
            f"About {pct(wf['retry_rate'])} of the work runs again, which costs {money(r['retry_cost'], cur)} "
            "a month. Fix the failing step before you scale this workflow.",
        )

    if wf["agent_calls_per_run"] > CHATTY_CALLS:
        add(
            "chatty_agents",
            "amber",
            "Agents pass work back and forth",
            f"Each run makes {num(wf['agent_calls_per_run'])} agent calls. Every hand off sends the context "
            "again, so tokens multiply. Merge steps or cut hand offs.",
        )

    human_hours = wf["review_hours"] + wf["maintenance_hours"]
    total_outcomes = sum(o["count"] for o in r["outcomes"])
    per_outcome = human_hours / max(total_outcomes, 1)
    if per_outcome > REVIEW_HOURS_PER_OUTCOME:
        add(
            "review_heavy",
            "info",
            "Human time per result is high",
            f"Review and upkeep take {num(human_hours)} hours a month, about {per_outcome:.2f} hours per result. "
            "Check what you can spot check instead of reviewing every item.",
        )

    if wf.get("rule_based"):
        add(
            "use_simple_automation",
            "info",
            "This could run without a model",
            "You marked this workflow as fixed rules. Plain automation can often run fixed rule steps "
            "with no token cost at all.",
        )

    losing = [o for o in r["outcomes"] if o["count"] and o["cost_per_outcome"] > o["revenue_per_outcome"]]
    if losing:
        parts = [
            f"each {o['name'].lower()} costs {money(o['cost_per_outcome'], cur)} to deliver but brings in "
            f"{money(o['revenue_per_outcome'], cur)}"
            for o in losing
        ]
        add(
            "losing_per_outcome",
            "red",
            "You lose money on every result",
            "Right now " + "; ".join(parts) + ". Raise the price or cut cost before you add volume.",
        )

    if not out:
        add(
            "healthy",
            "info",
            "Healthy",
            f"This workflow keeps {pct(margin)} of its revenue, at or above your {pct(target)} target, "
            "and no cost warning was found.",
        )
    return out


def compute_portfolio(results):
    total_revenue = sum(r["revenue_monthly"] for r in results)
    total_delivery = sum(r["delivery_cost"] for r in results)
    total_profit = sum(r["gross_profit"] for r in results)
    with_margin = [r for r in results if r["gross_margin"] is not None]

    def brief(r):
        return None if r is None else {"id": r["id"], "name": r["name"], "gross_margin": r["gross_margin"]}

    most = least = None
    for r in with_margin:
        if most is None or r["gross_margin"] > most["gross_margin"]:
            most = r
        if least is None or r["gross_margin"] < least["gross_margin"]:
            least = r
    return {
        "workflow_count": len(results),
        "total_revenue": total_revenue,
        "total_delivery_cost": total_delivery,
        "total_gross_profit": total_profit,
        "portfolio_margin": total_profit / total_revenue if total_revenue else None,
        "red_count": sum(1 for r in results if r["status"] == "red"),
        "most_profitable": brief(most),
        "least_profitable": brief(least),
    }


def analyse(data):
    """Validate, then compute every workflow and the portfolio."""
    errors = validate(data)
    if errors:
        raise DataError("\n".join(errors))
    settings = settings_of(data)
    results = [compute_workflow(wf, settings) for wf in data["workflows"]]
    return {"version": VERSION, "settings": settings, "workflows": results, "portfolio": compute_portfolio(results)}


# ---------------------------------------------------------------- data


def settings_of(data):
    return {key: data.get(key, default) for key, default in DEFAULT_SETTINGS.items()}


def parse_settings(text):
    """Accept inline JSON ({"target_margin": 0.65}) or key=value pairs separated by commas."""
    if not text:
        return {}
    text = text.strip()
    if text.startswith("{"):
        try:
            value = json.loads(text)
        except json.JSONDecodeError as exc:
            raise DataError(f"The --settings value is not valid JSON: {exc.msg}.") from exc
        if not isinstance(value, dict):
            raise DataError("The --settings value must be a JSON object.")
        return value
    result = {}
    for pair in text.split(","):
        if "=" not in pair:
            raise DataError(f"The --settings part '{pair}' needs the form key=value.")
        key, raw = (part.strip() for part in pair.split("=", 1))
        if key not in DEFAULT_SETTINGS:
            raise DataError(f"Unknown setting '{key}'. Use currency, target_margin or warning_margin.")
        if key == "currency":
            result[key] = raw.upper()
        else:
            try:
                result[key] = float(raw)
            except ValueError as exc:
                raise DataError(f"The setting '{key}' must be a number, for example 0.6.") from exc
    return result


def load(path, overrides=None):
    path = Path(path)
    if not path.exists():
        raise DataError(
            f"Cannot find {path}. Copy data/sample-workflows.json to data/workflows.json, "
            "or pass --file with the path to your file."
        )
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DataError(f"{path.name} is not valid JSON: {exc.msg} on line {exc.lineno}, column {exc.colno}.") from exc
    if not isinstance(data, dict):
        raise DataError(f"{path.name} must hold a JSON object with a 'workflows' list.")
    if overrides:
        data = {**data, **overrides}
    return data


def validate(data):
    """Return a list of plain word error messages. Empty list means the file is fine."""
    errors = []
    if not isinstance(data, dict):
        return ["The file must hold a JSON object with a 'workflows' list."]

    currency = data.get("currency", "USD")
    if not isinstance(currency, str) or not currency.strip():
        errors.append("Setting 'currency' must be a short code such as USD.")
    for key in ("target_margin", "warning_margin"):
        value = data.get(key, DEFAULT_SETTINGS[key])
        if not is_number(value):
            errors.append(f"Setting '{key}' must be a number between 0 and 1, for example 0.6.")
        elif not 0 <= value < 1:
            errors.append(f"Setting '{key}' is {value}. Use a number from 0 up to but not including 1.")
    target = data.get("target_margin", DEFAULT_SETTINGS["target_margin"])
    warning = data.get("warning_margin", DEFAULT_SETTINGS["warning_margin"])
    if is_number(target) and is_number(warning) and warning > target:
        errors.append("Setting 'warning_margin' should not be higher than 'target_margin'.")

    workflows = data.get("workflows")
    if not isinstance(workflows, list):
        return errors + ["The file needs a 'workflows' list."]
    if not workflows:
        errors.append("The 'workflows' list is empty. Add at least one workflow.")

    seen = set()
    for index, wf in enumerate(workflows, start=1):
        if not isinstance(wf, dict):
            errors.append(f"Workflow {index} must be a JSON object.")
            continue
        label = f"Workflow {index}" + (f" ({wf['name']})" if isinstance(wf.get("name"), str) else "")
        errors.extend(_validate_workflow(wf, label, seen))
    return errors


def _validate_workflow(wf, label, seen):
    errors = []
    for key in ("id", "name"):
        if not isinstance(wf.get(key), str) or not wf.get(key).strip():
            errors.append(f"{label}: field '{key}' is missing or empty.")
    if isinstance(wf.get("id"), str):
        if wf["id"] in seen:
            errors.append(f"{label}: the id '{wf['id']}' is used twice. Each workflow needs its own id.")
        seen.add(wf["id"])

    for key in REQUIRED_NUMBERS:
        if key not in wf:
            errors.append(f"{label}: field '{key}' is missing.")
        elif not is_number(wf[key]):
            errors.append(f"{label}: field '{key}' must be a number, it is {json.dumps(wf[key])}.")
        elif wf[key] < 0:
            errors.append(f"{label}: field '{key}' is negative ({wf[key]}). Use 0 or more.")
    if is_number(wf.get("retry_rate")) and wf["retry_rate"] > 1:
        errors.append(f"{label}: field 'retry_rate' is {wf['retry_rate']}. Write it as a share, 0.2 means 20 percent.")

    override = wf.get("model_cost_override")
    if override is not None and (not is_number(override) or override < 0):
        errors.append(f"{label}: field 'model_cost_override' must be empty (null) or a number of 0 or more.")
    if "rule_based" in wf and not isinstance(wf["rule_based"], bool):
        errors.append(f"{label}: field 'rule_based' must be true or false.")

    outcomes = wf.get("outcomes", [])
    if not isinstance(outcomes, list):
        errors.append(f"{label}: field 'outcomes' must be a list.")
        return errors
    if len(outcomes) > 3:
        errors.append(f"{label}: has {len(outcomes)} outcomes. Track up to 3.")
    for number, outcome in enumerate(outcomes, start=1):
        if not isinstance(outcome, dict):
            errors.append(f"{label}: outcome {number} must be an object with 'name' and 'count'.")
            continue
        if not isinstance(outcome.get("name"), str) or not outcome.get("name").strip():
            errors.append(f"{label}: outcome {number} needs a 'name'.")
        count = outcome.get("count")
        if not is_number(count):
            errors.append(f"{label}: outcome {number} needs a 'count' number.")
        elif count < 0:
            errors.append(f"{label}: outcome {number} count is negative ({count}). Use 0 or more.")
    return errors


# ---------------------------------------------------------------- output


def render_report(analysis):
    cur = analysis["settings"]["currency"]
    s = analysis["settings"]
    lines = [
        "AI Agent Profitability Report",
        f"Target margin {pct(s['target_margin'])}, warning under {pct(s['warning_margin'])}. "
        "Example rates: replace them with your provider's current price per 1M tokens.",
        "",
    ]
    for r in analysis["workflows"]:
        lines += _render_workflow(r, cur)
    p = analysis["portfolio"]
    lines += [
        "PORTFOLIO (all workflows)",
        f"  Revenue          {money(p['total_revenue'], cur):>14}",
        f"  Delivery cost    {money(p['total_delivery_cost'], cur):>14}",
        f"  Gross profit     {money(p['total_gross_profit'], cur):>14}",
        f"  Portfolio margin {pct(p['portfolio_margin']):>14}",
        f"  Workflows in red {p['red_count']:>14}",
    ]
    if p["most_profitable"]:
        lines.append(f"  Most profitable  {p['most_profitable']['name']} ({pct(p['most_profitable']['gross_margin'])})")
        lines.append(f"  Least profitable {p['least_profitable']['name']} ({pct(p['least_profitable']['gross_margin'])})")
    lines.append("")
    return "\n".join(lines)


def _render_workflow(r, cur):
    def row(label, value):
        return f"  {label:<26}{value:>14}"

    status_word = {"green": "GREEN, healthy", "amber": "AMBER, under target", "red": "RED, under warning"}[r["status"]]
    lines = [f"{r['name']}" + (f"  [{r['client']}]" if r["client"] else ""), f"  Status: {status_word}"]
    lines += [
        row("Revenue per month", money(r["revenue_monthly"], cur)),
        "  1. Agent costs",
        row("  AI model (base)", money(r["model_base"], cur)),
        row("  Infrastructure", money(r["infrastructure_monthly"], cur)),
        row("  Other tools", money(r["tools_monthly"], cur)),
        "  2. Hidden costs",
        row("  Retries", money(r["retry_cost"], cur)),
        row("  Human review", money(r["review_cost"], cur)),
        row("  Upkeep", money(r["maintenance_cost"], cur)),
        row("Delivery cost", money(r["delivery_cost"], cur)),
        row("Gross profit", money(r["gross_profit"], cur)),
        row("Gross margin", pct(r["gross_margin"])),
        row("AI model share of cost", pct(r["model_share"])),
        row("Cost per run", money(r["cost_per_run"], cur)),
        row("Price for target margin", money(r["price_for_target"], cur)),
    ]
    if r["outcomes"]:
        lines.append("  3. Cost per outcome")
        for o in r["outcomes"]:
            lines.append(
                f"    {o['name']} ({num(o['count'])}): costs {money(o['cost_per_outcome'], cur)}, "
                f"earns {money(o['revenue_per_outcome'], cur)}, profit {money(o['profit_per_outcome'], cur)}"
            )
    lines.append("  5. Recommendations")
    for rec in r["recommendations"]:
        lines.append(f"    [{rec['severity'].upper()}] {rec['title']}: {rec['detail']}")
    lines.append("")
    return lines


CSV_FIELDS = (
    "id", "name", "client", "status", "revenue_monthly", "model_base", "retry_cost", "model_cost",
    "infrastructure_monthly", "tools_monthly", "review_cost", "maintenance_cost", "agent_costs",
    "hidden_costs", "delivery_cost", "gross_profit", "gross_margin", "model_share", "cost_per_run",
    "break_even_price", "price_for_target", "recommendation_ids",
)


def render_csv(analysis):
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(CSV_FIELDS)
    for r in analysis["workflows"]:
        row = []
        for field in CSV_FIELDS:
            if field == "recommendation_ids":
                row.append(" ".join(rec["id"] for rec in r["recommendations"]))
                continue
            value = r[field]
            if isinstance(value, float):
                value = round(value, 4) if field in ("gross_margin", "model_share") else round(value, 2)
            row.append("" if value is None else value)
        writer.writerow(row)
    return buffer.getvalue()


# ---------------------------------------------------------------- cli


def build_parser():
    parser = argparse.ArgumentParser(
        prog="margin.py",
        description="Work out the real profit of each AI workflow. Nothing leaves your computer.",
    )
    parser.add_argument("command", choices=("report", "json", "csv", "check"), help="what to print")
    parser.add_argument("--file", default=str(DEFAULT_FILE), help="workflows JSON file (default data/workflows.json)")
    parser.add_argument(
        "--settings",
        default="",
        help='override settings, for example target_margin=0.65,warning_margin=0.5 or \'{"currency": "EUR"}\'',
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {VERSION}")
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        data = load(args.file, parse_settings(args.settings))
        if args.command == "check":
            errors = validate(data)
            if errors:
                print(f"Found {len(errors)} problem(s) in {Path(args.file).name}:", file=sys.stderr)
                for error in errors:
                    print(f"  * {error}", file=sys.stderr)
                return 1
            count = len(data["workflows"])
            print(f"OK: {Path(args.file).name} has {count} valid workflow(s).")
            return 0
        analysis = analyse(data)
    except DataError as exc:
        print("Cannot run the calculator:", file=sys.stderr)
        for line in str(exc).splitlines():
            print(f"  * {line}", file=sys.stderr)
        print("Run 'python3 tools/margin.py check' for the full list.", file=sys.stderr)
        return 1

    if args.command == "json":
        print(json.dumps(analysis, indent=2))
    elif args.command == "csv":
        sys.stdout.write(render_csv(analysis))
    else:
        print(render_report(analysis))
    return 0


if __name__ == "__main__":
    sys.exit(main())
