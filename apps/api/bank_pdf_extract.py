from __future__ import annotations

import re
from datetime import date
from decimal import Decimal, InvalidOperation


def _parse_amount(raw: str) -> Decimal | None:
    cleaned = (raw or "").replace(",", "").replace("RM", "").replace("rm", "").strip()
    negative = cleaned.startswith("-") or cleaned.startswith("(")
    cleaned = cleaned.strip("()-+").strip()
    if not re.fullmatch(r"\d{1,3}(,\d{3})*(\.\d{1,2})?|\d+(\.\d{1,2})?", cleaned.replace(",", "")):
        if not re.fullmatch(r"\d+(\.\d{1,2})?", cleaned):
            return None
    try:
        value = Decimal(cleaned)
    except InvalidOperation:
        return None
    if negative:
        value = -value
    return value


def _parse_date(raw: str) -> str | None:
    raw = (raw or "").strip()
    # DD/MM/YYYY or DD-MM-YYYY
    m = re.fullmatch(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})", raw)
    if m:
        d_, mth, yr = m.groups()
        if len(yr) == 2:
            yr = "20" + yr
        try:
            return date(int(yr), int(mth), int(d_)).isoformat()
        except ValueError:
            return None
    # DD MMM YYYY / DD MMMM YYYY
    m = re.fullmatch(r"(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{2,4})", raw)
    if m:
        months = {
            "jan": 1, "feb": 2, "mar": 3, "mac": 3, "apr": 4, "may": 5, "mei": 5,
            "jun": 6, "jul": 7, "aug": 8, "ogo": 8, "sep": 9, "oct": 10, "okt": 10,
            "nov": 11, "dec": 12, "dis": 12,
        }
        key = m.group(2)[:3].lower()
        if key in months:
            yr = m.group(3)
            if len(yr) == 2:
                yr = "20" + yr
            try:
                return date(int(yr), months[key], int(m.group(1))).isoformat()
            except ValueError:
                return None
    return None


DATE_HINT = re.compile(r"\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b|\b\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{2,4}\b")
BALANCE_HEADER = re.compile(r"\b(balance|baki|ledger)\b", re.I)
DEBIT_HEADER = re.compile(r"\b(debit|withdrawal|keluar|dr)\b", re.I)
CREDIT_HEADER = re.compile(r"\b(credit|deposit|masuk|cr)\b", re.I)
AMOUNT_HEADER = re.compile(r"\b(amount|amaun|jumlah|transaction)\b", re.I)


def parse_pdf_tables(payload: bytes, password: str | None = None) -> list[dict]:
    """Extract transactions from PDF statement tables using positional column data."""
    import pdfplumber
    import io as _io

    try:
        pdf = pdfplumber.open(_io.BytesIO(payload), password=password or "")
    except Exception as exc:
        msg = str(exc)
        if "password" in msg.lower() or "encrypt" in msg.lower():
            raise ValueError("PDF_PASSWORD_INVALID") from exc
        raise ValueError(f"PDF could not be opened: {msg[:150]}") from exc

    transactions: list[dict] = []
    with pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables or []:
                rows = [r for r in table if r]
                if not rows:
                    continue
                header_idx = None
                debit_col = credit_col = None
                balance_col = None
                # find header row containing debit/credit markers
                for i, row in enumerate(rows[:12]):
                    cells = [(str(c) if c else "") for c in row]
                    joined = " ".join(cells)
                    if DEBIT_HEADER.search(joined) or CREDIT_HEADER.search(joined):
                        header_idx = i
                        for col, cell in enumerate(cells):
                            if DEBIT_HEADER.search(cell) and not debit_col:
                                debit_col = col
                            if CREDIT_HEADER.search(cell) and not credit_col:
                                credit_col = col
                            if BALANCE_HEADER.search(cell) and not balance_col:
                                balance_col = col
                        break
                if header_idx is None:
                    continue
                for row in rows[header_idx + 1 :]:
                    cells = [(str(c).strip() if c else "") for c in row]
                    if len(cells) < 3:
                        continue
                    # locate date cell
                    date_str = None
                    date_col = None
                    for col, cell in enumerate(cells):
                        if cell and DATE_HINT.fullmatch(cell.strip()):
                            date_str = _parse_date(cell.strip())
                            date_col = col
                            break
                    if not date_str:
                        continue
                    debit_val = _parse_amount(cells[debit_col]) if debit_col is not None and debit_col < len(cells) else None
                    credit_val = _parse_amount(cells[credit_col]) if credit_col is not None and credit_col < len(cells) else None
                    # description = all cells except date/debit/credit/balance columns
                    skip_cols = {date_col, debit_col, credit_col, balance_col}
                    desc_parts = [c for idx, c in enumerate(cells) if idx not in skip_cols and c]
                    description = " ".join(desc_parts)[:300]
                    # strip trailing running-balance-like numbers from description
                    description = re.sub(r"[\s,]*\d{1,3}(?:,\d{3})*\.\d{2}\s*$", "", description).strip()
                    amount: Decimal | None = None
                    txn_type = None
                    if debit_val is not None and debit_val != 0:
                        amount, txn_type = debit_val, "expense"
                    elif credit_val is not None and credit_val != 0:
                        amount, txn_type = credit_val, "income"
                    if amount is None or txn_type is None or not description:
                        continue
                    if amount <= 0 or amount > Decimal("9999999999"):
                        continue
                    transactions.append({
                        "id": f"pdf-{len(transactions)}-{date_str}-{amount}",
                        "date": date_str,
                        "rawDate": date_str,
                        "time": "",
                        "description": description,
                        "amount": float(amount),
                        "type": txn_type,
                        "selected": True,
                    })
            # Borderless statements: use word x/y positions and header column coordinates.
            if not transactions:
                words = page.extract_words(use_text_flow=False, keep_blank_chars=False)
                lines: dict[int, list[dict]] = {}
                for word in words:
                    y = round(float(word["top"]) / 3) * 3
                    lines.setdefault(y, []).append(word)
                header_x: dict[str, float] = {}
                for line in lines.values():
                    ordered = sorted(line, key=lambda w: float(w["x0"]))
                    for word in ordered:
                        token = str(word["text"])
                        center = (float(word["x0"]) + float(word["x1"])) / 2
                        if DEBIT_HEADER.fullmatch(token): header_x["debit"] = center
                        if CREDIT_HEADER.fullmatch(token): header_x["credit"] = center
                        if BALANCE_HEADER.fullmatch(token): header_x["balance"] = center
                if "debit" not in header_x and "credit" not in header_x:
                    continue
                for line in lines.values():
                    ordered = sorted(line, key=lambda w: float(w["x0"]))
                    date_word = next((w for w in ordered if DATE_HINT.fullmatch(str(w["text"]))), None)
                    if not date_word:
                        continue
                    date_str = _parse_date(str(date_word["text"]))
                    if not date_str:
                        continue
                    numeric = []
                    for word in ordered:
                        value = _parse_amount(str(word["text"]))
                        if value is not None:
                            numeric.append((word, value, (float(word["x0"]) + float(word["x1"])) / 2))
                    chosen = None
                    txn_type = None
                    for kind in ("debit", "credit"):
                        if kind not in header_x:
                            continue
                        candidates = [(abs(x - header_x[kind]), value) for _, value, x in numeric]
                        if candidates:
                            distance, value = min(candidates)
                            if distance < 45:
                                chosen = value
                                txn_type = "expense" if kind == "debit" else "income"
                                break
                    if chosen is None or chosen <= 0:
                        continue
                    amount_x = min((x for _, value, x in numeric if value == chosen), default=99999)
                    description = " ".join(str(w["text"]) for w in ordered if float(w["x0"]) > float(date_word["x1"]) and float(w["x1"]) < amount_x - 3).strip()
                    if not description:
                        continue
                    transactions.append({"id": f"pdf-{len(transactions)}-{date_str}-{chosen}", "date": date_str, "rawDate": date_str, "time": "", "description": description[:300], "amount": float(chosen), "type": txn_type, "selected": True})
    return transactions
