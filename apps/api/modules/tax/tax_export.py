"""Generate a minimal, valid single-page PDF Tax Pack using only the stdlib.

Produces a text-only A4 PDF. Robust and dependency-free.
"""

from __future__ import annotations


def _escape(text: str) -> str:
    return (text or "").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_tax_pack_pdf(title: str, lines: list[tuple[str, str, str]]) -> bytes:
    """lines = list of (label, value, style). style in '', 'header', 'hr', 'big'."""
    page_w = 595
    page_h = 842
    margin = 50
    line_h = 16

    # ── build font objects ────────────────────────────────────────────────
    font_normal = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    font_bold = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"

    # ── build content stream ──────────────────────────────────────────────
    stream = []
    y = page_h - margin

    def bt(font, size, x, yy, text):
        stream.append(f"BT /{font} {size} Tf {x} {yy:.1f} Td ({_escape(text)}) Tj ET")

    def hr(yy):
        stream.append(f"0.75 0.75 0.75 RG 50 {yy:.1f} m 545 {yy:.1f} l S")

    for label, value, style in lines:
        if style == "header":
            bt("F2", 18, margin, y, value)
            y -= 26
            hr(y)
            y -= 10
        elif style == "hr":
            hr(y)
            y -= line_h
        elif style == "big":
            bt("F2", 15, margin, y, value)
            y -= line_h
        else:
            bt("F2", 10, margin, y, label)
            bt("F1", 10, 300, y, value)
            y -= line_h

    content = "\n".join(stream)

    # ── assemble objects with correct xref offsets ────────────────────────
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_w} {page_h}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
        font_normal,
        font_bold,
        f"<< /Length {len(content.encode('latin-1', 'replace'))} >>\nstream\n{content}\nendstream",
    ]

    out = bytearray()
    out += b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        header = f"{i} 0 obj\n".encode("latin-1", "replace")
        body = obj.encode("latin-1", "replace")
        out += header
        out += body
        out += b"\nendobj\n"

    xref_pos = len(out)
    count = len(objects) + 1
    out += f"xref\n0 {count}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {count} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()
    return bytes(out)
