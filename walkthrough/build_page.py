# -*- coding: utf-8 -*-
"""Build the standalone kernel page and artifact fragment from this directory.

Run ``python walkthrough/build_page.py`` from the repository root, or use the
absolute script path from any other working directory. Python's standard library
and the committed walkthrough sources/data/assets are the only dependencies.
"""
from pathlib import Path
import hashlib
import json
import re

from assets.assemble import assemble


HERE = Path(__file__).resolve().parent
PAGE_SCRIPTS = (
    "kernel_model.js", "page.js", "anim_core.js", "anim_a.js",
    "tensor_inspector.js", "anim_b.js", "anim_c.js", "anim_d.js", "anim_z.js", "replay_bridge.js",
    "hardware_page.js",
    "runtime_perf.js",
)


def main():
    body = (HERE / "body.html").read_text(encoding="utf-8")
    new = (HERE / "body_new.html").read_text(encoding="utf-8")
    first_section = re.search(r'<section id="s-arch".*?</section>', body, re.S)
    if not first_section:
        raise ValueError("s-arch section not found in body.html")
    merged = body[:first_section.end()] + "\n\n" + new + body[first_section.end():]
    # Check all inputs before writing either output, so a missing source is clear.
    scripts = [HERE / name for name in PAGE_SCRIPTS]
    kernel = json.loads((HERE / "kernel.json").read_text(encoding="utf-8"))
    hardware = json.loads((HERE / "hardware.json").read_text(encoding="utf-8"))
    kernel.update(hardware)
    data = {"FIGS": HERE / "figs.json", "PACK": HERE / "pack.json"}
    params = json.loads(data["PACK"].read_text(encoding="utf-8"))["params"]
    params_id = hashlib.sha256(json.dumps(params, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    page = assemble(
        title="QCSNN kernel 解读",
        description="topFunction HLS kernel 的数据通路、调度、资源，以及逐位对齐的功能模型与数值动画；数字来自本机综合、实现报告和 CPU 上的 C++ 参照",
        body=merged, scripts=scripts, data=data,
        values={"K": kernel, "REPLAY_META": {"paramsId": params_id}},
    )
    (HERE / "body_merged.html").write_text(merged, encoding="utf-8")
    page_path = HERE / "qcsnn_kernel_walkthrough.html"
    page_path.write_text(page, encoding="utf-8")
    fragment = re.sub(r'^<!doctype html>\s*<html[^>]*>\s*<head>\s*', '', page, flags=re.I)
    fragment = re.sub(r'<meta charset[^>]*>\s*<meta name="viewport"[^>]*>\s*', '', fragment)
    fragment = re.sub(r'<meta name="description"[^>]*>\s*', '', fragment)
    fragment = re.sub(r'</head>\s*<body[^>]*>', '', fragment)
    fragment = re.sub(r'</body>\s*</html>\s*$', '', fragment)
    artifact_path = HERE / "kernel_artifact.html"
    artifact_path.write_text(fragment, encoding="utf-8")
    print(f"wrote {page_path.name} ({page_path.stat().st_size:,} bytes)")
    print(f"artifact fragment {artifact_path.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
