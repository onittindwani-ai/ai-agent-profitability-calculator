#!/usr/bin/env python3
"""Kit check: every file exists, no dashes, no secrets, valid data, working links.

Standard library only. Run: python3 tests/check_kit.py
Exit code 0 means every check passed.
"""

from __future__ import annotations

import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

REQUIRED = [
    "README.md", "LICENSE", "CHANGELOG.md", "VERSION", "AI-Agent-Profitability-Calculator.xlsx",
    "app/index.html", "app/app.css", "app/app.js", "app/engine.js",
    "data/sample-workflows.json", "data/workflows.json",
    "tools/margin.py", "tools/build_workbook.py", "tools/serve.py",
    ".claude/skills/agent-profitability/SKILL.md",
    ".claude/commands/margin-audit.md", ".claude/commands/margin-report.md",
    "docs/00-START-HERE.md", "docs/01-THE-APP.md", "docs/02-THE-SPREADSHEET.md", "docs/03-WITH-CLAUDE-CODE.md",
    "docs/04-HOW-THE-MATH-WORKS.md", "docs/05-CUT-YOUR-COSTS.md", "docs/LIMITS-AND-HONESTY.md", "docs/SECURITY.md",
    "tests/test_margin.py", "tests/engine.test.mjs", "tests/fixtures/expected.json", "tests/check_kit.py",
    ".github/workflows/ci.yml",
]
REQUIRED_DIRS = ["app/assets", "screenshots"]
TEXT_SUFFIXES = {".md", ".html", ".css", ".js", ".mjs", ".py", ".json", ".yml", ".yaml", ".svg", ".txt"}
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv"}
DASHES = re.compile("[\u2013\u2014\u2015\u2212]")
# Patterns are split so this file does not match itself.
SECRETS = [
    ("OpenAI style key", re.compile(r"\bs" + r"k-[A-Za-z0-9_\-]{16,}")),
    ("api_key assignment", re.compile(r"api" + r"_key\s*=\s*['\"]?[A-Za-z0-9_\-]{8,}", re.I)),
    ("AWS access key", re.compile(r"\bAK" + r"IA[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\bgh" + r"p_[A-Za-z0-9]{20,}")),
]
NETWORK = [
    re.compile(r"\bfetch\s*\("),
    re.compile(r"XMLHttpRequest"),
    re.compile(r"sendBeacon"),
    re.compile(r"new\s+WebSocket"),
    re.compile(r"<script[^>]+src=[\"']https?://", re.I),
    re.compile(r"<link[^>]+href=[\"']https?://[^>]*stylesheet|<link[^>]+stylesheet[^>]*href=[\"']https?://", re.I),
    re.compile(r"url\(\s*[\"']?https?://", re.I),
]


class Report:
    def __init__(self):
        self.failures = []
        self.passed = 0

    def check(self, ok, message):
        if ok:
            self.passed += 1
        else:
            self.failures.append(message)
        return ok


def text_files():
    for path in ROOT.rglob("*"):
        if path.is_file() and path.suffix.lower() in TEXT_SUFFIXES and not (set(path.relative_to(ROOT).parts) & SKIP_DIRS):
            yield path


def check_tree(rep):
    for rel in REQUIRED:
        rep.check((ROOT / rel).is_file(), f"Missing file: {rel}")
    for rel in REQUIRED_DIRS:
        rep.check((ROOT / rel).is_dir(), f"Missing folder: {rel}")
    shots = list((ROOT / "screenshots").glob("*.png")) if (ROOT / "screenshots").is_dir() else []
    rep.check(len(shots) >= 2, f"screenshots/ should hold at least 2 PNG screenshots, found {len(shots)}")
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip() if (ROOT / "VERSION").exists() else ""
    rep.check(version == "1.0.0", f"VERSION should be 1.0.0, it is '{version}'")
    licence = (ROOT / "LICENSE").read_text(encoding="utf-8") if (ROOT / "LICENSE").exists() else ""
    rep.check("MIT License" in licence and "Copyright (c) 2026 Onit Tindwani" in licence, "LICENSE is not the MIT licence for Onit Tindwani")


def check_text(rep):
    for path in text_files():
        rel = path.relative_to(ROOT)
        text = path.read_text(encoding="utf-8", errors="replace")
        for number, line in enumerate(text.splitlines(), start=1):
            if DASHES.search(line):
                rep.check(False, f"Dash character in {rel} line {number}")
            for label, pattern in SECRETS:
                if pattern.search(line):
                    rep.check(False, f"Possible secret ({label}) in {rel} line {number}")
        rep.check(True, "")
        if rel.parts[0] == "app":
            for pattern in NETWORK:
                rep.check(not pattern.search(text), f"Possible network call or remote load in {rel}: {pattern.pattern}")


def check_data(rep):
    import margin

    for rel in ("data/sample-workflows.json", "data/workflows.json", "tests/fixtures/expected.json"):
        path = ROOT / rel
        if not path.exists():
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            rep.check(False, f"{rel} is not valid JSON: {exc.msg} line {exc.lineno}")
            continue
        if rel.startswith("data/"):
            errors = margin.validate(data)
            rep.check(not errors, f"{rel} fails margin.py check: {errors[:3]}")
            if rel == "data/sample-workflows.json":
                names = " ".join(wf.get("client", "") for wf in data.get("workflows", []))
                rep.check("fictional" in names.lower(), "Sample clients must be labelled fictional")


def check_xlsx(rep):
    path = ROOT / "AI-Agent-Profitability-Calculator.xlsx"
    if not path.exists():
        return
    try:
        with zipfile.ZipFile(path) as zf:
            rep.check(zf.testzip() is None, "The xlsx has a damaged part")
            workbook = zf.read("xl/workbook.xml").decode("utf-8")
    except (zipfile.BadZipFile, KeyError) as exc:
        rep.check(False, f"The xlsx does not open: {exc}")
        return
    for sheet in ("Start Here", "Settings", "Workflows", "Dashboard", "Recommendations"):
        rep.check(f'name="{sheet}"' in workbook, f"The xlsx is missing the tab '{sheet}'")
    banned = ("LET(", "LAMBDA(", "XLOOKUP(", "FILTER(", "SEQUENCE(", "UNIQUE(")
    with zipfile.ZipFile(path) as zf:
        sheets = " ".join(zf.read(n).decode("utf-8") for n in zf.namelist() if n.startswith("xl/worksheets/"))
    for word in banned:
        rep.check(word not in sheets, f"The xlsx uses {word[:-1]}, which older Excel and Google Sheets imports may not support")


def check_links(rep):
    link = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
    for path in [ROOT / "README.md", *sorted((ROOT / "docs").glob("*.md"))]:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for target in link.findall(text):
            if target.startswith(("http://", "https://", "mailto:", "#")):
                continue
            clean = target.split("#")[0]
            rep.check((path.parent / clean).exists(), f"Broken link in {path.relative_to(ROOT)}: {target}")
        for url in re.findall(r"https://github\.com/[^\s)>\]]+", text):
            rep.check(
                url.rstrip(".,") == "https://github.com/onittindwani-ai/ai-agent-profitability-calculator",
                f"GitHub link in {path.relative_to(ROOT)} is not the repo home: {url}",
            )
    readme = (ROOT / "README.md").read_text(encoding="utf-8") if (ROOT / "README.md").exists() else ""
    rep.check("SCREENSHOT_LIST" not in readme, "README still has the screenshot placeholder")
    first_section = readme.split("## ")[1] if "## " in readme else ""
    rep.check(first_section.startswith("Quick start with Claude Code"), "README must open with the Claude Code quick start")


def main():
    rep = Report()
    check_tree(rep)
    check_text(rep)
    check_data(rep)
    check_xlsx(rep)
    check_links(rep)
    if rep.failures:
        print(f"Kit check FAILED: {len(rep.failures)} problem(s), {rep.passed} checks passed.")
        for failure in rep.failures:
            print(f"  * {failure}")
        return 1
    print(f"Kit check OK: {rep.passed} checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
