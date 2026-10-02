# -*- coding: utf-8 -*-
"""Generate an xsim testbench for one generated LIF module (forward_N), run it, and write what the RTL did.

The testbench replays what the parent module does around the LIF module: it streams the layer's input bytes through a
show-ahead FIFO model, keeps the V0/V1 membrane RAMs as behavioural dual-port RAMs, feeds bank_o back to bank_i between
calls, and calls the module once per time step.  Everything else (counters, DSP48 templates, rounding) is the generated RTL.

usage: python gen_tb_lif.py forward_11 b8 10
"""
import os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
RTL = os.path.normpath(os.path.join(HERE, "..", "..", "hls", "work_csynth", "hls", "syn", "verilog"))
SIM = os.path.join(HERE, "sim")
VIVADO = r"E:\Xilinx\2026.1\Vivado"


def ports(src):
    head = src[src.index("module "):]
    head = head[:head.index(");")]
    names = [n.strip() for n in head.split("(", 1)[1].replace("\n", " ").split(",")]
    decl = {}
    for m in re.finditer(r"^(input|output)\s*(?:reg\s*)?(?:signed\s*)?(\[(\d+):0\])?\s*(\w+);", src, re.M):
        decl[m.group(4)] = (m.group(1), int(m.group(3)) + 1 if m.group(3) else 1)
    return names, decl


def build(mod, label, ncall, n, stall=False):
    f = os.path.join(RTL, f"topFunction_{mod}.v")
    src = open(f, encoding="utf-8").read()
    names, decl = ports(src)
    s_in = [x for x in names if x.endswith("_dout") and decl[x][0] == "input"][0][:-5]
    s_out = [x for x in names if x.endswith("_din") and decl[x][0] == "output"][0][:-4]
    ram = sorted({re.sub(r"_(address0|ce0|we0|d0|address1|ce1|q1)$", "", x) for x in names if re.search(r"_V[01]\w*_(address0|ce0|we0|d0|address1|ce1|q1)$", x)})
    assert len(ram) == 2, ram
    pre = re.sub(r"_V[01].*$", "", ram[0])
    bank = [x for x in names if x.endswith("_bank_i")][0][:-7]
    aw = decl[ram[0] + "_address0"][1]
    iters = sorted({int(m.group(1)) for m in re.finditer(r"reg\s+ap_enable_reg_pp0_iter(\d+);", src)})
    probes = {k: (re.search(r"reg\s+(?:signed\s*)?\[(\d+):0\]\s+(%s_reg_\d+);" % k, src)) for k in ("v_prev_q", "prod_b", "v_next_q")}
    probe_names = [(k, m.group(2), int(m.group(1)) + 1) for k, m in probes.items() if m]
    deps = sorted(set(re.findall(r"^(topFunction_\w+)\s*(?:#\(|\w+\()", src, re.M)) - {f"topFunction_{mod}"})
    # the instantiation line is "topFunction_x #(" ; filter to modules that have a file
    deps = [d for d in deps if os.path.exists(os.path.join(RTL, d + ".v"))]
    v0, v1 = ram
    olabel = label + ('_stall' if stall else '')
    tb = []
    A = tb.append
    A("`timescale 1ns/1ps")
    A("module tb;")
    A(f"  parameter N = {n}; parameter NCALL = {ncall}; parameter STALL = {1 if stall else 0};")
    A("  reg ap_clk = 0; reg ap_rst = 1; reg ap_start = 0; wire ap_done, ap_idle, ap_ready;")
    A("  always #5 ap_clk = ~ap_clk;")
    A("  reg [31:0] lf = 32'hACE1ACE1; always @(posedge ap_clk) lf <= {lf[30:0], lf[31]^lf[21]^lf[1]^lf[0]};")
    A("  wire sin = (STALL != 0) && lf[4] && lf[9]; wire sout = (STALL != 0) && lf[13] && lf[2] && lf[7];")

    A("  reg [7:0] in_mem [0:N*NCALL-1]; integer in_idx = 0, in_lim = 0;")
    A("  wire [7:0] s_dout = (in_idx < in_lim) ? in_mem[in_idx] : 8'bx; wire s_empty_n = (in_idx < in_lim) && !sin; wire s_read;")
    A("  always @(posedge ap_clk) if (s_read && s_empty_n) in_idx <= in_idx + 1;")
    A("  wire s_write; wire [7:0] s_din; integer fspk, fst, ftr; always @(posedge ap_clk) if (s_write) $fwrite(fspk, \"%0d\\n\", s_din);")
    for i, v in enumerate((v0, v1)):
        A(f"  reg [23:0] m{i} [0:N-1]; wire [{aw-1}:0] a0_{i}, a1_{i}; wire ce0_{i}, we0_{i}, ce1_{i}; wire [23:0] d0_{i}; reg [23:0] q1_{i};")
        A(f"  always @(posedge ap_clk) begin if (ce0_{i} && we0_{i}) m{i}[a0_{i}] <= d0_{i}; if (ce1_{i}) q1_{i} <= m{i}[a1_{i}]; end")
    A("  reg bank_i = 0; wire bank_o, bank_o_vld; always @(posedge ap_clk) if (bank_o_vld) bank_i <= bank_o;")
    A(f"  topFunction_{mod} dut(.ap_clk(ap_clk), .ap_rst(ap_rst), .ap_start(ap_start), .ap_done(ap_done), .ap_idle(ap_idle), .ap_ready(ap_ready),")
    A(f"    .{s_in}_dout(s_dout), .{s_in}_empty_n(s_empty_n), .{s_in}_read(s_read), .{s_out}_din(s_din), .{s_out}_full_n(~sout), .{s_out}_write(s_write),")
    for i, v in enumerate((v0, v1)):
        A(f"    .{v}_address0(a0_{i}), .{v}_ce0(ce0_{i}), .{v}_we0(we0_{i}), .{v}_d0(d0_{i}), .{v}_address1(a1_{i}), .{v}_ce1(ce1_{i}), .{v}_q1(q1_{i}),")
    A(f"    .{bank}_bank_i(bank_i), .{bank}_bank_o(bank_o), .{bank}_bank_o_ap_vld(bank_o_vld));")
    itbits = "{" + ", ".join(f"dut.ap_enable_reg_pp0_iter{i}" for i in reversed(iters)) + "}"
    A("  integer cyc = 0, tracing = 0, ntr = 0, t0 = 0, k, i, lat;")
    A("  initial begin #(10*(N*NCALL+400)*4); $display(\"WATCHDOG\"); $finish; end")
    A("  always @(posedge ap_clk) begin cyc <= cyc + 1; if (tracing && ((cyc - t0 < 70) || (cyc - t0 > N - 8 && cyc - t0 < N + 60))) begin ntr = ntr + 1; if (ntr > 220) tracing = 0;")
    pf = " ".join(f"{p}=%0d" for p, _, _ in probe_names)
    pa = "".join(f", $signed(dut.{r})" for _, r, _ in probe_names)
    A(f"    $fwrite(ftr, \"%0d start=%b fsm=%0d iter=%b rd=%b rd_addr=%0d q1=%0d wr=%b wr_addr=%0d wr_d=%0d fifo_rd=%b idx=%0d din=%0d empty_n=%b fifo_wr=%b full_n=%b out=%0d {pf}\\n\", cyc, ap_start, dut.ap_CS_fsm, {itbits}, (ce1_0|ce1_1), (ce1_0 ? a1_0 : a1_1), (dut.rd_reg_{'%s'} ? $signed(q1_1) : $signed(q1_0)), (we0_0|we0_1), (we0_0 ? a0_0 : a0_1), (we0_0 ? $signed(d0_0) : $signed(d0_1)), s_read, in_idx, $signed(s_dout), s_empty_n, s_write, ~sout, s_din{pa});")
    A("  end end")
    A("  initial begin")
    A(f"    $readmemh(\"vec/{mod}_{label}_in.hex\", in_mem); fspk = $fopen(\"out/{mod}_{olabel}_spk.txt\", \"w\"); fst = $fopen(\"out/{mod}_{olabel}_state.txt\", \"w\"); ftr = $fopen(\"out/{mod}_{olabel}_trace.txt\", \"w\");")
    A("    for (i = 0; i < N; i = i + 1) begin m0[i] = 0; m1[i] = 0; end")
    A("    repeat (5) @(negedge ap_clk); ap_rst = 0; repeat (2) @(negedge ap_clk);")
    A("    for (k = 0; k < NCALL; k = k + 1) begin")
    A("      @(negedge ap_clk); in_idx = k*N; in_lim = (k+1)*N; if (k == 0) begin tracing = 1; t0 = cyc; end")
    A("      @(negedge ap_clk); ap_start = 1; lat = 0;")
    A("      @(posedge ap_clk); while (!ap_ready) begin lat = lat + 1; @(posedge ap_clk); end")
    A("      @(negedge ap_clk); ap_start = 0; if (k == 0) begin tracing = 0; $fwrite(fst, \"LAT %0d\\n\", lat + 1); end")
    A("      repeat (3) @(posedge ap_clk);")
    A("      for (i = 0; i < N; i = i + 1) $fwrite(fst, \"%0d \", $signed(m0[i])); $fwrite(fst, \"\\n\");")
    A("      for (i = 0; i < N; i = i + 1) $fwrite(fst, \"%0d \", $signed(m1[i])); $fwrite(fst, \"\\n\"); $fwrite(fst, \"%0d\\n\", bank_i);")
    A("    end")
    A("    $fclose(fspk); $fclose(fst); $fclose(ftr); $finish;")
    A("  end")
    A("endmodule")
    text = "\n".join(tb)
    # the rd_reg name is module specific
    m = re.search(r"reg\s+\[0:0\]\s+(rd_reg_\d+);", src)
    text = text.replace("dut.rd_reg_%s", "dut." + m.group(1))
    path = os.path.join(SIM, f"tb_{mod}_{olabel}.v")
    os.makedirs(os.path.join(SIM, "out"), exist_ok=True)
    open(path, "w", encoding="utf-8").write(text)
    return path, deps




# xvlog / cmd mis-handle the Chinese folder name, so the simulation runs in an ASCII-only work directory
WORK = "E:/0Project/_xsim_work".replace("/", os.sep)


def run(mod, label, ncall, n, stall=False):
    import shutil
    path, deps = build(mod, label, ncall, n, stall)
    olabel = label + ('_stall' if stall else '')
    os.makedirs(os.path.join(WORK, "out"), exist_ok=True)
    if not os.path.exists(os.path.join(WORK, "vec")):
        shutil.copytree(os.path.join(SIM, "vec"), os.path.join(WORK, "vec"))
    files = []
    for src in [path, os.path.join(RTL, f"topFunction_{mod}.v")] + [os.path.join(RTL, d + ".v") for d in deps]:
        dst = os.path.join(WORK, os.path.basename(src))
        shutil.copy(src, dst)
        files.append(os.path.basename(src))
    bat = os.path.join(WORK, f"run_{mod}_{olabel}.bat")
    lines = ["@echo off", "call %s\\settings64.bat" % VIVADO, "cd /d %s" % WORK, "call xvlog %s" % " ".join(files),
             "call xelab tb -s sim_%s_%s -debug off" % (mod, olabel), "call xsim sim_%s_%s -runall" % (mod, olabel)]
    open(bat, "w", encoding="ascii", newline="").write("\r\n".join(lines) + "\r\n")
    r = subprocess.run(["cmd", "/c", bat], capture_output=True, text=True, encoding="utf-8", errors="replace")
    for fn in os.listdir(os.path.join(WORK, "out")):
        if fn.startswith(f"{mod}_{olabel}_"):
            shutil.copy(os.path.join(WORK, "out", fn), os.path.join(SIM, "out", fn))
    return r.returncode, r.stdout[-1500:], r.stderr[-800:]


if __name__ == "__main__":
    import json
    mod, label = sys.argv[1], sys.argv[2]
    idx = json.load(open(os.path.join(SIM, "vec", "index.json")))
    c = [x for x in idx["cases"] if x["mod"] == mod and x["label"] == label][0]
    rc, so, se = run(mod, label, c["calls"], c["n"])
    print(rc)
    print(so)
    print(se)
