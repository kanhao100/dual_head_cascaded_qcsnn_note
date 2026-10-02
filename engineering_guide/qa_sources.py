"""Check that guide excerpts and the portable configuration match this workspace."""
from pathlib import Path
import hashlib
import json
import re

HERE=Path(__file__).resolve().parent
ROOT=HERE.parent

def main():
    data=json.loads((HERE/"engineering.json").read_text(encoding="utf-8"))
    ids={f["id"] for f in data["files"]}
    checks=0
    for entry in data["files"]:
        path=ROOT/entry["path"]
        text=path.read_text(encoding="utf-8")
        assert hashlib.sha256(text.encode()).hexdigest()==entry["sha256"]
        for section in entry["sections"]:
            if entry.get("sourceType")=="notebook":
                lines="".join(json.loads(text)["cells"][section["cell"]]["source"]).splitlines()
            else:
                lines=text.splitlines()
            assert section["code"]=="\n".join(lines[section["start"]-1:section["end"]])
            checks+=1
    for item in data["pragmas"]:
        assert item["fileId"] in ids
        file=next(f for f in data["files"] if f["id"]==item["fileId"])
        assert 0 <= item["sectionIndex"] < len(file["sections"])
        checks+=1
    for step in data["facts"]["callChain"]:
        assert step["fileId"] in ids
    cfg=(HERE/"hls_current.cfg").read_text(encoding="utf-8")
    top=(ROOT/"csnn_cpp/include/hls4csnn1d_sd/model24/cblk_sd/topclass24_sd.cpp").as_posix()
    assert f"syn.file={top}" in cfg
    assert f"syn.file_cflags={top}," in cfg
    assert f'package.output.file={(HERE/"qcsnn_topFunction_ip.zip").as_posix()}' in cfg
    assert "syn.top=topFunction" in cfg and "clock=10ns" in cfg
    assert not re.search(r"^tb.file=",cfg,re.M)
    html=(HERE/"qcsnn_engineering_guide.html").read_text(encoding="utf-8")
    assert not re.search(r"<(?:script[^>]*src=|link[^>]*rel=[\"']stylesheet)",html,re.I)
    assert len(html.encode("utf-8")) < 1000000
    print(f"PASS {len(data['files'])} real source files, {checks} excerpt/primitive references, include-safe current-workspace config, offline HTML")

if __name__=="__main__":
    main()
