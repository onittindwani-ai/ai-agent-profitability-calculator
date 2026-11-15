"""Tests for tools/margin.py. Run with: python3 -m unittest discover tests"""

import copy
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import margin  # noqa: E402

SAMPLE = ROOT / "data" / "sample-workflows.json"
EXPECTED = json.loads((ROOT / "tests" / "fixtures" / "expected.json").read_text(encoding="utf-8"))
SHARES = {"gross_margin", "model_share", "portfolio_margin"}


def sample_data():
    return json.loads(SAMPLE.read_text(encoding="utf-8"))


def workflow(data, wf_id):
    return next(wf for wf in data["workflows"] if wf["id"] == wf_id)


class SampleNumbers(unittest.TestCase):
    """Every per workflow and portfolio number, to the cent."""

    @classmethod
    def setUpClass(cls):
        cls.analysis = margin.analyse(sample_data())
        cls.by_id = {r["id"]: r for r in cls.analysis["workflows"]}

    def assertValue(self, key, actual, expected, label):
        if expected is None:
            self.assertIsNone(actual, f"{label} {key}")
        elif key in SHARES:
            self.assertAlmostEqual(actual, expected, places=5, msg=f"{label} {key}")
        elif isinstance(expected, str):
            self.assertEqual(actual, expected, f"{label} {key}")
        else:
            self.assertEqual(round(actual, 2), round(expected, 2), f"{label} {key}")

    def test_every_workflow_number(self):
        for wf_id, exp in EXPECTED["workflows"].items():
            r = self.by_id[wf_id]
            for key, value in exp.items():
                if key in ("outcomes", "recommendation_ids"):
                    continue
                self.assertValue(key, r[key], value, wf_id)

    def test_outcomes(self):
        for wf_id, exp in EXPECTED["workflows"].items():
            actual = self.by_id[wf_id]["outcomes"]
            self.assertEqual(len(actual), len(exp["outcomes"]), wf_id)
            for got, want in zip(actual, exp["outcomes"]):
                self.assertEqual(got["name"], want["name"])
                for key in ("cost_per_outcome", "revenue_per_outcome", "profit_per_outcome"):
                    self.assertValue(key, got[key], want[key], f"{wf_id} {want['name']}")

    def test_recommendation_ids_and_order(self):
        for wf_id, exp in EXPECTED["workflows"].items():
            ids = [rec["id"] for rec in self.by_id[wf_id]["recommendations"]]
            self.assertEqual(ids, exp["recommendation_ids"], wf_id)

    def test_recommendations_are_complete_and_plain(self):
        for r in self.analysis["workflows"]:
            for rec in r["recommendations"]:
                self.assertIn(rec["severity"], ("red", "amber", "info"))
                self.assertTrue(rec["title"] and rec["detail"])
                for text in (rec["title"], rec["detail"]):
                    self.assertNotIn("\u2014", text)
                    self.assertNotIn("\u2013", text)

    def test_red_recommendation_names_target_price(self):
        rec = self.by_id["ai-voice-follow-ups"]["recommendations"][0]
        self.assertEqual(rec["id"], "margin_below_warning")
        self.assertIn("$1,286.90", rec["detail"])

    def test_portfolio(self):
        p = self.analysis["portfolio"]
        exp = EXPECTED["portfolio"]
        for key in ("total_revenue", "total_delivery_cost", "total_gross_profit", "portfolio_margin"):
            self.assertValue(key, p[key], exp[key], "portfolio")
        self.assertEqual(p["red_count"], exp["red_count"])
        self.assertEqual(p["most_profitable"]["id"], exp["most_profitable_id"])
        self.assertEqual(p["least_profitable"]["id"], exp["least_profitable_id"])

    def test_display_rounding(self):
        for wf_id, exp in EXPECTED["display"].items():
            if wf_id == "portfolio":
                self.assertEqual(margin.pct(self.analysis["portfolio"]["portfolio_margin"]), exp["portfolio_margin"])
            else:
                self.assertEqual(margin.pct(self.by_id[wf_id]["gross_margin"]), exp["gross_margin"])

    def test_reel_example_numbers(self):
        r = self.by_id["ai-sdr-outbound"]
        self.assertEqual(round(r["model_cost"], 2), 180.00)
        self.assertEqual(r["infrastructure_monthly"], 70)
        self.assertEqual(r["tools_monthly"], 100)
        self.assertEqual(round(r["review_cost"] + r["maintenance_cost"], 2), 150.00)
        self.assertEqual(margin.money(r["gross_profit"]), "$1,000.00")


class EdgeCases(unittest.TestCase):
    def run_case(self, name):
        case = EXPECTED["edge_cases"][name]
        data = sample_data()
        wf = copy.deepcopy(workflow(data, case["base_workflow"]))
        wf.update(case["input"])
        return margin.compute_workflow(wf, margin.settings_of(data)), case["expected"]

    def test_override(self):
        r, exp = self.run_case("override")
        for key, value in exp.items():
            self.assertEqual(round(r[key], 2), value, key)

    def test_zero_revenue(self):
        r, exp = self.run_case("zero_revenue")
        self.assertIsNone(r["gross_margin"])
        self.assertEqual(round(r["delivery_cost"], 2), exp["delivery_cost"])
        self.assertEqual(round(r["gross_profit"], 2), exp["gross_profit"])
        self.assertEqual(r["status"], "red")
        self.assertEqual(r["recommendations"][0]["id"], "margin_below_warning")

    def test_zero_outcomes(self):
        r, exp = self.run_case("zero_outcomes")
        outcome = r["outcomes"][0]
        for key, value in exp.items():
            self.assertEqual(outcome[key], value, key)
        self.assertNotIn("losing_per_outcome", [rec["id"] for rec in r["recommendations"]])

    def test_zero_everything_does_not_crash(self):
        data = sample_data()
        wf = copy.deepcopy(workflow(data, "inbox-reply-agent"))
        for key in margin.REQUIRED_NUMBERS:
            wf[key] = 0
        wf["outcomes"] = []
        r = margin.compute_workflow(wf, margin.settings_of(data))
        self.assertEqual(r["delivery_cost"], 0)
        self.assertEqual(r["model_share"], 0)
        self.assertIsNone(r["cost_per_run"])
        self.assertIsNone(r["gross_margin"])

    def test_portfolio_with_zero_revenue_workflow(self):
        data = sample_data()
        data["workflows"][2]["revenue_monthly"] = 0
        p = margin.analyse(data)["portfolio"]
        self.assertEqual(p["most_profitable"]["id"], "ai-sdr-outbound")
        self.assertEqual(p["red_count"], 2)

    def test_amber_and_target_gap(self):
        data = sample_data()
        wf = workflow(data, "ai-sdr-outbound")
        wf["revenue_monthly"] = 1100  # margin 54.5 percent: amber
        r = margin.compute_workflow(wf, margin.settings_of(data))
        self.assertEqual(r["status"], "amber")
        self.assertEqual(r["recommendations"][0]["id"], "margin_below_target")

    def test_model_heavy_and_losing(self):
        data = sample_data()
        wf = workflow(data, "inbox-reply-agent")
        wf["model_cost_override"] = 2000
        r = margin.compute_workflow(wf, margin.settings_of(data))
        ids = [rec["id"] for rec in r["recommendations"]]
        self.assertEqual(ids, ["margin_below_warning", "model_heavy", "losing_per_outcome"])

    def test_settings_override_changes_status(self):
        data = margin.load(SAMPLE, margin.parse_settings("target_margin=0.7,warning_margin=0.65"))
        by_id = {r["id"]: r for r in margin.analyse(data)["workflows"]}
        self.assertEqual(by_id["ai-sdr-outbound"]["status"], "amber")
        self.assertEqual(round(by_id["ai-sdr-outbound"]["price_for_target"], 2), 1666.67)

    def test_settings_inline_json(self):
        self.assertEqual(margin.parse_settings('{"currency": "EUR"}'), {"currency": "EUR"})
        with self.assertRaises(margin.DataError):
            margin.parse_settings("colour=blue")


class Validation(unittest.TestCase):
    def test_sample_is_valid(self):
        self.assertEqual(margin.validate(sample_data()), [])

    def test_missing_and_negative_fields(self):
        data = sample_data()
        del data["workflows"][0]["runs_monthly"]
        data["workflows"][1]["tools_monthly"] = -5
        data["workflows"][2]["retry_rate"] = 20
        errors = margin.validate(data)
        joined = "\n".join(errors)
        self.assertIn("'runs_monthly' is missing", joined)
        self.assertIn("'tools_monthly' is negative", joined)
        self.assertIn("0.2 means 20 percent", joined)
        self.assertIn("Workflow 1 (AI SDR outbound campaign)", joined)

    def test_bad_types_and_duplicates(self):
        data = sample_data()
        data["workflows"][1]["id"] = data["workflows"][0]["id"]
        data["workflows"][0]["revenue_monthly"] = "1500"
        data["workflows"][0]["outcomes"].append({"name": "", "count": -1})
        data["target_margin"] = 1.5
        joined = "\n".join(margin.validate(data))
        self.assertIn("used twice", joined)
        self.assertIn("must be a number", joined)
        self.assertIn("needs a 'name'", joined)
        self.assertIn("count is negative", joined)
        self.assertIn("'target_margin' is 1.5", joined)

    def test_analyse_refuses_bad_data(self):
        with self.assertRaises(margin.DataError):
            margin.analyse({"workflows": []})


class CommandLine(unittest.TestCase):
    def run_cli(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = margin.main(list(args))
        return code, out.getvalue(), err.getvalue()

    def test_report(self):
        code, out, _ = self.run_cli("report", "--file", str(SAMPLE))
        self.assertEqual(code, 0)
        self.assertIn("Portfolio margin", out)
        self.assertIn("63.5%", out)
        self.assertNotIn("\u2014", out)
        self.assertNotIn("\u2013", out)

    def test_json(self):
        code, out, _ = self.run_cli("json", "--file", str(SAMPLE))
        self.assertEqual(code, 0)
        self.assertEqual(round(json.loads(out)["portfolio"]["total_gross_profit"], 2), 2095.69)

    def test_csv(self):
        code, out, _ = self.run_cli("csv", "--file", str(SAMPLE))
        self.assertEqual(code, 0)
        lines = out.strip().splitlines()
        self.assertEqual(len(lines), 4)
        self.assertTrue(lines[0].startswith("id,name,client,status"))

    def test_check_ok_and_errors(self):
        code, out, _ = self.run_cli("check", "--file", str(SAMPLE))
        self.assertEqual(code, 0)
        self.assertIn("3 valid workflow", out)
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "bad.json"
            data = sample_data()
            del data["workflows"][0]["hourly_rate"]
            bad.write_text(json.dumps(data), encoding="utf-8")
            code, _, err = self.run_cli("check", "--file", str(bad))
            self.assertEqual(code, 1)
            self.assertIn("'hourly_rate' is missing", err)
            broken = Path(tmp) / "broken.json"
            broken.write_text("{not json", encoding="utf-8")
            code, _, err = self.run_cli("report", "--file", str(broken))
            self.assertEqual(code, 1)
            self.assertIn("not valid JSON", err)

    def test_missing_file(self):
        code, _, err = self.run_cli("report", "--file", "/nonexistent/workflows.json")
        self.assertEqual(code, 1)
        self.assertIn("Cannot find", err)


if __name__ == "__main__":
    unittest.main()
