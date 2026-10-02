# -*- coding: utf-8 -*-
"""xsim testbench for a generated convolution engine: the input-load module, the 48 banked input_buffer RAMs, the compute
module and the shared requantisation multiplier, wired the way the parent module wires them.

usage: python gen_tb_conv.py forward_14 b8
"""
import json, os, re, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
RTL = os.path.normpath(os.path.join(HERE, "..", "..", "hls", "work_csynth", "hls", "syn", "verilog"))
SIM = os.path.join(HERE, "sim")
VIVADO = r"E:\Xilinx\2026.1\Vivado"
WORK = "E:/0Project/_xsim_work".replace("/", os.sep)
IC = 16


def read(name):
    return open(os.path.join(RTL, name), encoding="utf-8").read()


def closure(files):
    seen, todo = [], list(files)
    while todo:
        f = todo.pop()
        if f in seen:
            continue
        seen.append(f)
        for m in set(re.findall(r"\btopFunction_[A-Za-z0-9_]+", read(f))):
            g = m + ".v"
            if g != f and os.path.exists(os.path.join(RTL, g)) and g not in seen:
                todo.append(g)
    return seen


def build(par, label, nin, nout, steps, poison=False, stall=False):
    olabel = label + ('_poison' if poison else '') + ('_stall' if stall else '')
    ldn = f"topFunction_{par}_Pipeline_VITIS_LOOP_46_1_VITIS_LOOP_47_2"
    cpn = f"topFunction_{par}_Pipeline_VITIS_LOOP_58_3_VITIS_LOOP_59_4"
    ld, cp = read(ldn + ".v"), read(cpn + ".v")
    banks = sorted({re.sub(r"_(address0|ce0|q0)$", "", x) for x in re.findall(r"^(?:input|output)\s*(?:\[[^\]]*\])?\s*(input_buffer\w*_(?:address0|ce0|q0));", cp, re.M)})
    aw = int(re.search(r"output\s*\[(\d+):0\]\s*input_buffer_address0;", cp).group(1)) + 1
    ar = (nin // IC + 2) // 3
    s_in = re.search(r"input\s*\[7:0\]\s*(\w+)_dout;", ld).group(1)
    s_out = re.search(r"output\s*\[7:0\]\s*(\w+)_din;", cp).group(1)
    ram = f"topFunction_{par}_input_buffer_RAM_AUTO_1R1W"
    iters = sorted({int(m.group(1)) for m in re.finditer(r"reg\s+ap_enable_reg_pp0_iter(\d+);", cp)})
    T = []
    A = T.append
    A("`timescale 1ns/1ps")
    A("module tb;")
    A(f"  parameter NIN = {nin}; parameter NOUT = {nout}; parameter NSTEP = {steps};")
    A("  reg ap_clk = 0; reg ap_rst = 1; always #5 ap_clk = ~ap_clk;")
    A(f"  parameter STALL = {1 if stall else 0}; reg [31:0] lf = 32'hACE1ACE1; always @(posedge ap_clk) lf <= {{lf[30:0], lf[31]^lf[21]^lf[1]^lf[0]}};")
    A("  wire sin = (STALL != 0) && lf[4] && lf[9]; wire sout = (STALL != 0) && lf[13] && lf[2] && lf[7];")
    A("  reg [7:0] in_mem [0:NIN*NSTEP-1]; integer in_idx = 0, in_lim = 0;")
    A(f"  wire [7:0] {s_in}_dout = (in_idx < in_lim) ? in_mem[in_idx] : 8'bx; wire {s_in}_empty_n = (in_idx < in_lim) && !sin; wire {s_in}_read;")
    A(f"  always @(posedge ap_clk) if ({s_in}_read && {s_in}_empty_n) in_idx <= in_idx + 1;")
    A("  reg ld_active = 0; reg ld_start = 0; wire ld_done, ld_idle, ld_ready;")
    A("  reg cp_start = 0; wire cp_done, cp_idle, cp_ready;")
    A(f"  wire cp_write; wire [7:0] cp_din; integer fo, ftr, flog;")
    A("  wire [30:0] m_din0; wire [19:0] m_din1; wire [50:0] m_dout; wire m_ce;")
    A("  topFunction_mul_31ns_20s_51_2_1 #(.ID(1), .NUM_STAGE(2), .din0_WIDTH(31), .din1_WIDTH(20), .dout_WIDTH(51)) mulu(.clk(ap_clk), .ce(m_ce), .reset(ap_rst), .din0(m_din0), .din1(m_din1), .dout(m_dout));")
    ldp, cpp = [], []
    for b in banks:
        A(f"  wire [{aw-1}:0] la_{b}, ca_{b}; wire lc_{b}, lw_{b}, cc_{b}; wire [7:0] ld_{b}, q_{b};")
        A(f"  {ram} #(.DataWidth(8), .AddressRange({ar}), .AddressWidth({aw})) r_{b}(.clk(ap_clk), .reset(1'b0), .address0(ld_active ? la_{b} : ca_{b}), .ce0(ld_active ? lc_{b} : cc_{b}), .we0(ld_active ? lw_{b} : 1'b0), .d0(ld_{b}), .q0(q_{b}));")
        ldp.append(f".{b}_address0(la_{b}), .{b}_ce0(lc_{b}), .{b}_we0(lw_{b}), .{b}_d0(ld_{b})")
        cpp.append(f".{b}_address0(ca_{b}), .{b}_ce0(cc_{b}), .{b}_q0(q_{b})")
    A(f"  {ldn} ldu(.ap_clk(ap_clk), .ap_rst(ap_rst), .ap_start(ld_start), .ap_done(ld_done), .ap_idle(ld_idle), .ap_ready(ld_ready), .{s_in}_dout({s_in}_dout), .{s_in}_empty_n({s_in}_empty_n), .{s_in}_read({s_in}_read),")
    A("    " + ", ".join(ldp) + ");")
    A(f"  {cpn} cpu(.ap_clk(ap_clk), .ap_rst(ap_rst), .ap_start(cp_start), .ap_done(cp_done), .ap_idle(cp_idle), .ap_ready(cp_ready), .{s_out}_din(cp_din), .{s_out}_full_n(~sout), .{s_out}_write(cp_write),")
    A("    .grp_fu_394_p_din0(m_din0), .grp_fu_394_p_din1(m_din1), .grp_fu_394_p_dout0(m_dout), .grp_fu_394_p_ce(m_ce),")
    A("    " + ", ".join(cpp) + ");")
    A("  always @(posedge ap_clk) if (cp_write) $fwrite(fo, \"%0d\\n\", $signed(cp_din));")
    itbits = "{" + ", ".join(f"cpu.ap_enable_reg_pp0_iter{i}" for i in reversed(iters)) + "}"
    b0 = banks[0]
    A("  wire [%d:0] xv = {%s};" % (len(banks) - 1, ", ".join("((^q_%s) === 1'bx)" % b for b in banks)))
    A("  integer cyc = 0, tracing = 0, t0 = 0, k, i, lat, ntr = 0, fb;")
    A("  initial begin #(10*(NSTEP*(NIN+NOUT+600))*3); $display(\"WATCHDOG\"); $finish; end")
    A("  always @(posedge ap_clk) begin cyc <= cyc + 1; if (tracing && (cyc - t0 < 150)) begin")
    A(f"    $fwrite(ftr, \"%0d start=%b fsm=%0d iter=%b bank0_ce=%b bank0_addr=%0d bank0_q=%0d mul_ce=%b mul_a=%0d mul_b=%0d mul_p=%0d out_wr=%b out=%0d xv=%h\\n\", cyc - t0, cp_start, cpu.ap_CS_fsm, {itbits}, cc_{b0}, ca_{b0}, $signed(q_{b0}), m_ce, m_din0, $signed(m_din1), $signed(m_dout), cp_write, $signed(cp_din), xv);")
    A("  end end")
    A("  initial begin")
    A(f"    $readmemh(\"vec/{par}_{label}_in.hex\", in_mem); fo = $fopen(\"out/{par}_{olabel}_out.txt\", \"w\"); ftr = $fopen(\"out/{par}_{olabel}_trace.txt\", \"w\"); flog = $fopen(\"out/{par}_{olabel}_log.txt\", \"w\"); fb = $fopen(\"out/{par}_{olabel}_banks.txt\", \"w\");")
    for b in banks:
        A(f"    for (i = 0; i < {ar}; i = i + 1) r_{b}.ram[i] = {'$random' if poison else '0'};")
    A("    repeat (5) @(negedge ap_clk); ap_rst = 0; repeat (2) @(negedge ap_clk);")
    A("    for (k = 0; k < NSTEP; k = k + 1) begin")
    A("      @(negedge ap_clk); in_idx = k*NIN; in_lim = (k+1)*NIN; ld_active = 1;")
    A("      @(negedge ap_clk); ld_start = 1; lat = 0;")
    A("      @(posedge ap_clk); while (!ld_done) begin lat = lat + 1; @(posedge ap_clk); end")
    A("      @(negedge ap_clk); ld_start = 0; if (k == 0) $fwrite(flog, \"LAT_LOAD %0d\\n\", lat + 1);")
    A("      repeat (3) @(negedge ap_clk); ld_active = 0;")
    A("      if (k == 0) begin")
    for b in banks:
        A(f'        $fwrite(fb, "{b}"); for (i = 0; i < {ar}; i = i + 1) $fwrite(fb, " %0d", $signed(r_{b}.ram[i])); $fwrite(fb, "\\n");')
    A("      end")
    A("      @(negedge ap_clk); cp_start = 1; lat = 0; if (k == 0) begin tracing = 1; t0 = cyc; end")
    A("      @(posedge ap_clk); while (!cp_done) begin lat = lat + 1; @(posedge ap_clk); end")
    A("      @(negedge ap_clk); cp_start = 0; if (k == 0) begin tracing = 0; $fwrite(flog, \"LAT_COMP %0d\\n\", lat + 1); end")
    A("      repeat (3) @(negedge ap_clk);")
    A("    end")
    A("    $fclose(fo); $fclose(ftr); $fclose(flog); $finish;")
    A("  end")
    A("endmodule")
    path = os.path.join(SIM, f"tb_{par}_{olabel}.v")
    open(path, "w", encoding="utf-8").write("\n".join(T))
    deps = closure([ldn + ".v", cpn + ".v", ram + ".v", "topFunction_mul_31ns_20s_51_2_1.v"])
    return path, deps


def run(par, label, nin, nout, steps, poison=False, stall=False):
    olabel = label + ('_poison' if poison else '') + ('_stall' if stall else '')
    path, deps = build(par, label, nin, nout, steps, poison, stall)
    os.makedirs(os.path.join(WORK, "out"), exist_ok=True)
    if not os.path.exists(os.path.join(WORK, "vec")) or not os.path.exists(os.path.join(WORK, "vec", f"{par}_{label}_in.hex")):
        shutil.copytree(os.path.join(SIM, "vec"), os.path.join(WORK, "vec"), dirs_exist_ok=True)
    files = [os.path.basename(path)]
    shutil.copy(path, os.path.join(WORK, os.path.basename(path)))
    for d in deps:
        shutil.copy(os.path.join(RTL, d), os.path.join(WORK, d))
        files.append(d)
    bat = os.path.join(WORK, f"run_{par}_{olabel}.bat")
    lines = ["@echo off", "call %s\\settings64.bat" % VIVADO, "cd /d %s" % WORK, "call xvlog %s" % " ".join(files),
             "call xelab tb -s sim_%s_%s -debug off" % (par, olabel), "call xsim sim_%s_%s -runall" % (par, olabel)]
    open(bat, "w", encoding="ascii", newline="").write("\r\n".join(lines) + "\r\n")
    r = subprocess.run(["cmd", "/c", bat], capture_output=True, text=True, encoding="utf-8", errors="replace")
    for fn in os.listdir(os.path.join(WORK, "out")):
        if fn.startswith(f"{par}_{olabel}_"):
            shutil.copy(os.path.join(WORK, "out", fn), os.path.join(SIM, "out", fn))
    return r.returncode, r.stdout[-1500:], r.stderr[-800:]


if __name__ == "__main__":
    par, label = sys.argv[1], sys.argv[2]
    poison = 'poison' in sys.argv[3:]
    stall = 'stall' in sys.argv[3:]
    idx = json.load(open(os.path.join(SIM, "vec", "index.json")))
    c = [x for x in idx["conv"] if x["mod"] == par and x["label"] == label][0]
    rc, so, se = run(par, label, c["nin"], c["nout"], c["steps"], poison, stall)
    print(rc)
    print(so)
    print(se)
