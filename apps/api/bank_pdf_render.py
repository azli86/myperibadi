from __future__ import annotations

import base64
import os
import subprocess
import tempfile

MAX_PAGES = 20


def _render_pages(payload: bytes, password: str | None, max_pages: int) -> list[bytes]:
    """Render every PDF page to PNG via ghostscript (server-side, cache-proof)."""
    rendered: list[bytes] = []
    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = os.path.join(tmp, "statement.pdf")
        with open(pdf_path, "wb") as fh:
            fh.write(payload)
        last = int(max_pages)
        out_pattern = os.path.join(tmp, "page-%03d.png")
        cmd = ["gs", "-q", "-dSAFER", "-dBATCH", "-dNOPAUSE",
               "-sDEVICE=png16m", "-r200",
               f"-dFirstPage=1", f"-dLastPage={last}",
               f"-sOutputFile={out_pattern}", pdf_path]
        if password:
            cmd.insert(1, f"-sPDFPassword={password}")
        try:
            proc = subprocess.run(cmd, capture_output=True, timeout=180)
        except subprocess.TimeoutExpired as exc:
            raise ValueError("PDF rendering timed out") from exc
        if proc.returncode != 0:
            stderr = (proc.stderr or b"").decode("utf-8", "replace").strip()
            lowered = stderr.lower()
            if "password" in lowered or "encrypt" in lowered:
                raise ValueError("PDF_PASSWORD_INVALID")
            raise ValueError(f"PDF could not be rendered: {stderr[:200]}")
        index = 1
        while len(rendered) < max_pages:
            page_path = os.path.join(tmp, f"page-{index:03d}.png")
            if not os.path.exists(page_path):
                break
            with open(page_path, "rb") as fh:
                rendered.append(fh.read())
            index += 1
    if not rendered:
        raise ValueError("PDF rendered no pages")
    return rendered


def render_pdf_images(payload: bytes, password: str | None = None) -> list[str]:
    pages = _render_pages(payload, password, MAX_PAGES)
    if sum(len(page) for page in pages) > 60_000_000:
        raise ValueError("Statement images too large")
    return [f"data:image/png;base64,{base64.b64encode(page).decode()}" for page in pages]
