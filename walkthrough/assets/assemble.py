# -*- coding: utf-8 -*-
"""Local HTML assembler, adapted from Claude's fpga-hls-walkthrough script.

Source: ~/.claude/skills/fpga-hls-walkthrough/scripts/make_walkthrough.py.
The copied CSS, widget and template assets are documented in README.md. No
installed Claude skill, subprocess or caller working directory is used here.
"""
from html import escape
import json
from pathlib import Path
import re


ASSETS = Path(__file__).resolve().parent


def assemble(*, title, description, body, scripts, data, lang="zh-CN", values=None):
    """Return a single HTML file with embedded data and scripts in caller order."""
    template = (ASSETS / "walkthrough_template.html").read_text(encoding="utf-8")
    css = (ASSETS / "walkthrough.css").read_text(encoding="utf-8")
    embedded = [(ASSETS / "widgets.js").read_text(encoding="utf-8")]
    for name, path in data.items():
        if not re.fullmatch(r"[A-Za-z_]\w*", name):
            raise ValueError(f"Invalid JavaScript data name: {name}")
        value = json.loads(Path(path).read_text(encoding="utf-8"))
        embedded.append(f"const {name} = " + json.dumps(value, ensure_ascii=False, separators=(",", ":")) + ";")
    for name, value in (values or {}).items():
        if not re.fullmatch(r"[A-Za-z_]\w*", name):
            raise ValueError(f"Invalid JavaScript value name: {name}")
        embedded.append(f"const {name} = " + json.dumps(value, ensure_ascii=False, separators=(",", ":")) + ";")
    for path in scripts:
        path = Path(path)
        embedded.append(f"/* ---- {path.name} ---- */\n" + path.read_text(encoding="utf-8"))
    # HTML recognizes closing script tags even inside JS strings and comments.
    javascript = re.sub(r"</script", lambda _: "<\\/script", "\n".join(embedded), flags=re.I)
    replacements = {
        "TITLE": escape(title), "DESC": escape(description, quote=True),
        "LANG": escape(lang, quote=True), "RAIL_TITLE": escape(title),
        "CSS": css, "BODY": body, "SCRIPTS": javascript,
    }
    return re.sub(r"\{\{(TITLE|DESC|LANG|RAIL_TITLE|CSS|BODY|SCRIPTS)\}\}",
                  lambda match: replacements[match[1]], template)
