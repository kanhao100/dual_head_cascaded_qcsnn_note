# -*- coding: utf-8 -*-
"""Build the offline error browser from saved full-test inputs and C++ outputs.

No inference or training is run by this builder. All rows remain in the exact
normal/SVEB/VEB/F order used by full_test_meta.json and words_full.bin.
"""
from array import array
import base64
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import struct
import sys

HERE = Path(__file__).resolve().parent
DATA = HERE / "data"
CLASSES = ("normal", "sveb", "veb", "f")


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def packed(blob):
    return base64.b64encode(gzip.compress(blob, compresslevel=9, mtime=0)).decode("ascii")


def source(path):
    contents = path.read_bytes()
    return {
        "path": path.relative_to(HERE).as_posix(),
        "bytes": len(contents),
        "sha256": hashlib.sha256(contents).hexdigest(),
    }


def main():
    meta_path = DATA / "full_test_meta.json"
    labels_path = DATA / "labels_full.txt"
    predictions_path = DATA / "preds_top_full.txt"
    words_path = DATA / "words_full.bin"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    labels = [int(x) for x in labels_path.read_text().split()]
    predictions = [tuple(map(int, line.split())) for line in predictions_path.read_text().splitlines()]
    n = len(meta)
    if not (n == len(labels) == len(predictions)):
        raise ValueError("Full-test metadata, labels and C++ predictions have different lengths")
    words = words_path.read_bytes()
    if len(words) != n * 188:
        raise ValueError("words_full.bin must have exactly 188 bytes per beat")

    records = sorted({str(m["record"]) for m in meta})
    record_ids = {name: i for i, name in enumerate(records)}
    index = bytearray()
    matrix = [[0] * 4 for _ in CLASSES]
    counts = Counter()
    for i, (m, y, pred) in enumerate(zip(meta, labels, predictions)):
        if m["label"] != y or m["cls"] != CLASSES[y]:
            raise ValueError(f"Label/metadata disagreement at beat {i}")
        if len(pred) != 2 or pred[0] not in (0, 1) or pred[1] not in range(4):
            raise ValueError(f"Invalid C++ prediction at beat {i}")
        if pred[0] == 0 and pred[1] != 0:
            raise ValueError(f"An early-exit beat has a nonzero second output: {i}")
        final = pred[1] if pred[0] else 0
        matrix[y][final] += 1
        counts["errors" if final != y else "correct"] += 1
        if y > 0 and pred[0] == 0:
            counts["gate_miss"] += 1
        if y == 0 and pred[0] == 1:
            counts["gate_extra"] += 1
            if final == 0:
                counts["recovered"] += 1
        if pred[0] == 1 and final != y:
            counts["stage2_wrong"] += 1
        index.extend(struct.pack("<IBBBB", int(m["center"]), record_ids[str(m["record"])], y, *pred))

    rows = array("f")
    row_sources = []
    cursor = 0
    for label, cls in enumerate(CLASSES):
        path = DATA / "full_test" / cls / "beats.csv"
        row_sources.append(source(path))
        with path.open(encoding="utf-8") as stream:
            for line in stream:
                if not line.strip():
                    continue
                row = [float(x) for x in line.strip().split(",")]
                if len(row) != 184:
                    raise ValueError(f"Expected 180 ECG values + 4 RR features at beat {cursor}")
                if cursor >= n or meta[cursor]["label"] != label:
                    raise ValueError(f"CSV class order disagrees with metadata at beat {cursor}")
                rows.extend(row)
                cursor += 1
    if cursor != n:
        raise ValueError(f"CSV rows: {cursor}; metadata rows: {n}")
    if sys.byteorder != "little":
        rows.byteswap()

    pack = json.loads((HERE / "pack.json").read_text(encoding="utf-8"))
    params_id = hashlib.sha256(
        json.dumps(pack["params"], sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    catalog = {
        "schema": "qcsnn-error-browser-v1",
        "count": n,
        "records": records,
        "classes": list(CLASSES),
        "paramsId": params_id,
        "matrix": matrix,
        "counts": dict(counts),
        "index": packed(bytes(index)),
        "rows": packed(rows.tobytes()),
        "words": packed(words),
        "sources": [source(p) for p in (meta_path, labels_path, predictions_path, words_path)] + row_sources,
    }
    stats_path = HERE / "error_browser_stats.json"
    stats_path.write_text(compact({k: v for k, v in catalog.items() if k not in ("index", "rows", "words")}), encoding="utf-8")
    scripts = [
        "const ERROR_DATA = " + compact(catalog) + ";",
        "const ERROR_PARAMS = " + compact(pack["params"]) + ";",
        (HERE / "kernel_model.js").read_text(encoding="utf-8"),
        (HERE / "error_browser.js").read_text(encoding="utf-8"),
    ]
    javascript = "\n".join(scripts).replace("</script", "<\\/script")
    page = (HERE / "error_browser.html.in").read_text(encoding="utf-8")
    page = page.replace("{{CSS}}", (HERE / "error_browser.css").read_text(encoding="utf-8"))
    page = page.replace("{{SCRIPTS}}", javascript)
    out = HERE / "qcsnn_error_browser.html"
    out.write_text(page, encoding="utf-8")
    print(compact({"page": str(out), "bytes": out.stat().st_size, "beats": n, "matrix": matrix, "counts": dict(counts)}))


if __name__ == "__main__":
    main()
