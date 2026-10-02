# -*- coding: utf-8 -*-
"""Create the PATCHED COPIES used for the layer-by-layer reference run (upstream files are never touched):
   patched/qcsnn24_rrboth_sd_dump.h   copy of cblk_sd/qcsnn24_rrboth_sd.h with GOLD_* dump statements inserted
   patched/lif1d_integer.h            copy of cblk_sd/lif1d_integer.h with one read-only `visit` accessor added
The script PROVES the patches are purely additive: after removing the added lines (and undoing the three include
rewrites) the text must equal the original line for line. A unified diff is saved next to the copies."""
import difflib, os, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
UP = (HERE.parent.parent / "csnn_cpp/include/hls4csnn1d_sd/model24/cblk_sd").as_posix() + "/"
OUT = (HERE / "patched").as_posix() + "/"
os.makedirs(OUT, exist_ok=True)

# ------------------------------------------------------------------ LIF accessor
lif = open(UP + "lif1d_integer.h", encoding="utf-8").read()
MARK_LIF = "    // [golden-dump] read-only accessor\n    template <typename F> void visit(F&& f) const { f(&V0[0][0], &V1[0][0], OUT_CH * FEATURE_LEN, bank); }  // GOLD_ADDED\n\n"
assert lif.count("private:") == 1
lif_p = lif.replace("private:", MARK_LIF + "private:")
open(OUT + "lif1d_integer.h", "w", encoding="utf-8", newline="\n").write(lif_p)

# ------------------------------------------------------------------ forward() tee points
txt = open(UP + "qcsnn24_rrboth_sd.h", encoding="utf-8").read().replace("\r\n", "\n")
orig = txt
REWRITE = [('#include "../constants24_sd.h"', '#include <constants24_sd.h>'),
           ('#include "includeheaders24_sd.h"', '#include <includeheaders24_sd.h>'),
           ('#include "../utils_sd.h"', '#include <utils_sd.h>')]
for a, b in REWRITE:
    assert txt.count(a) == 1, a
    txt = txt.replace(a, b)
txt = txt.replace('#define QCSNN24_RRBOTH_SD_H\n', '#define QCSNN24_RRBOTH_SD_H\n#include "gold_dump.h"  // GOLD_ADDED\n', 1)

def stmt_end(s, start):
    """index just after the ';' that ends the call statement whose name starts at `start`"""
    i = s.index("(", start); depth = 0
    while True:
        if s[i] == "(": depth += 1
        elif s[i] == ")":
            depth -= 1
            if depth == 0: break
        i += 1
    return s.index(";", i) + 1

# (object, tag, output stream, is_lif)
T = [("trunk_conv1", "conv1", "s0", 0), ("trunk_bn1", "bn1", "s1", 0), ("trunk_lif1", "lif1", "s2", 1), ("trunk_mp1", "pool1", "s3", 0),
     ("trunk_qi2", "qi2", "s4", 0), ("trunk_conv2", "conv2", "s5", 0), ("trunk_bn2", "bn2", "s6", 0), ("trunk_lif2", "lif2", "s7", 1),
     ("trunk_mp2", "pool2", "s8", 0), ("trunk_qi3", "qi3", "s9", 0), ("trunk_conv3", "conv3", "s10", 0), ("trunk_bn3", "bn3", "s11", 0),
     ("trunk_lif3", "lif3", "s12", 1), ("trunk_mp3", "pool3", "s_body", 0),
     ("bin_qi", "bin_qi", "s_bin_qi_out", 0), ("bin_fc", "bin_fc", "s_bin_lif_in", 0), ("bin_lif", "bin_lif", "s_bin_out", 1),
     ("multi_qi1", "m_qi1", "s_m_qi1_out", 0), ("multi_fc1", "m_fc1", "s_m_lif1_out", 0), ("multi_lif1", "m_lif1", "s_m_qi2", 1),
     ("multi_qi2", "m_qi2", "s_m_fc2", 0), ("multi_fc2", "m_fc2", "s_m_lif2_in", 0), ("multi_lif2", "m_lif2", "s_m_out", 1)]
for obj, tag, stream, is_lif in T:
    key = obj + ".forward("
    assert txt.count(key) == 1, (obj, txt.count(key))
    p = txt.index(key)
    e = stmt_end(txt, p)
    ins = '\n            GOLD_TEE("%s", %s);  // GOLD_ADDED' % (tag, stream)
    if is_lif: ins += '\n            GOLD_LIF("%s", %s);  // GOLD_ADDED' % (tag, obj)
    txt = txt[:e] + ins + txt[e:]

# step markers: right after the opening brace of each time-step loop
for label, stage in (("STAGE1_LOOP:", 1), ("STAGE2_LOOP:", 2)):
    assert txt.count(label) == 1, label
    p = txt.index(label)
    m = re.compile(r"for \(int t = 0; t < NUM_STEPS; \+\+t\) \{").search(txt, p)
    assert m and m.start() - p < 80, label
    txt = txt[:m.end()] + "\n            GOLD_STEP(%d, t);  // GOLD_ADDED" % stage + txt[m.end():]

# gate and final sums
a = "ap_int8_c pred2 = gate_abnormal(sum_bin0, sum_bin1);"
assert txt.count(a) == 1
txt = txt.replace(a, a + "\n        GOLD_SUMS2(sum_bin0, sum_bin1, pred2);  // GOLD_ADDED")
b = "ap_int8_c pred4 = argmax4(sum4_0, sum4_1, sum4_2, sum4_3);"
assert txt.count(b) == 1
txt = txt.replace(b, b + "\n        GOLD_SUMS4(sum4_0, sum4_1, sum4_2, sum4_3, pred4);  // GOLD_ADDED")
open(OUT + "qcsnn24_rrboth_sd_dump.h", "w", encoding="utf-8", newline="\n").write(txt)

# ------------------------------------------------------------------ additive-only proof
def strip_added(s):
    return "\n".join(l for l in s.split("\n") if "GOLD_ADDED" not in l and "[golden-dump]" not in l)
def undo_rewrite(s):
    for a, b in REWRITE: s = s.replace(b, a)
    return s
chk_fwd = undo_rewrite(strip_added(txt)) == orig
chk_lif = strip_added(lif_p).replace("\r\n", "\n") == lif.replace("\r\n", "\n").replace("\n\n    // [golden-dump]", "\n\n    // [golden-dump]") or strip_added(lif_p).replace("\r\n", "\n").strip() == lif.replace("\r\n", "\n").strip().replace(MARK_LIF.strip(), "")
# LIF: compare by removing exactly the inserted block from the patched text
chk_lif = lif_p.replace(MARK_LIF, "") == lif
print("forward patch additive-only:", chk_fwd)
print("LIF accessor additive-only :", chk_lif)
if not (chk_fwd and chk_lif):
    sys.exit("patch is NOT purely additive")
d1 = "".join(difflib.unified_diff(orig.splitlines(True), txt.splitlines(True), "upstream/qcsnn24_rrboth_sd.h", "patched/qcsnn24_rrboth_sd_dump.h"))
d2 = "".join(difflib.unified_diff(lif.splitlines(True), lif_p.splitlines(True), "upstream/lif1d_integer.h", "patched/lif1d_integer.h"))
open(OUT + "patches.diff", "w", encoding="utf-8").write(d1 + "\n" + d2)
print("inserted lines:", sum(1 for l in txt.split("\n") if "GOLD_ADDED" in l), "| diff saved:", OUT + "patches.diff")
