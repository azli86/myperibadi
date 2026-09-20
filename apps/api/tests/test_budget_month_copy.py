"""Budget months must be able to inherit the previous month's amounts.

Budgets live in category_budgets keyed by (household, category, month_key), so
every new month opens blank. That is by design, but it meant the only way to
carry a recurring budget forward was to retype every category by hand — the
complaint in ticket #6.

This locks in the copy route: it exists, it is registered, it refuses a
same-month copy, and it never clobbers amounts the user already set unless
overwrite is asked for.
"""

from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
ROUTES = ROOT / "modules" / "budgets" / "routes.py"
SCHEMAS = ROOT / "schemas.py"
MAIN = ROOT / "main.py"
INIT = ROOT / "modules" / "budgets" / "__init__.py"


def test_copy_route_exists_and_is_exported():
    routes = ROUTES.read_text(encoding="utf-8")
    assert "async def copy_budgets_route(" in routes
    assert "copy_budgets_route" in INIT.read_text(encoding="utf-8")


def test_copy_route_is_registered_before_no_catch_all_conflict():
    main = MAIN.read_text(encoding="utf-8")
    assert '@app.post("/budgets/copy"' in main
    assert "_module_copy_budgets_route" in main
    # the copy path is static and must not be swallowed by a /budgets/{id} POST
    assert '@app.post("/budgets/{' not in main


def test_same_month_copy_is_rejected():
    routes = ROUTES.read_text(encoding="utf-8")
    assert "Source and target month are the same." in routes


def test_existing_amounts_survive_unless_overwrite_requested():
    routes = ROUTES.read_text(encoding="utf-8")
    # default must be non-destructive
    assert re.search(r"overwrite:\s*bool\s*=\s*False", SCHEMAS.read_text(encoding="utf-8"))
    # the skip branch must exist, i.e. an existing row is left alone by default
    assert re.search(r"elif copy_in\.overwrite:\s*\n\s*existing\.budget_amount", routes)
    assert "skipped += 1" in routes


def test_month_key_format_is_validated():
    routes = ROUTES.read_text(encoding="utf-8")
    assert routes.count("budget_service.normalize_month_key") >= 2
