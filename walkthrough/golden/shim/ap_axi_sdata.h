// Minimal CPU-only stand-in for Xilinx <ap_axi_sdata.h> (not part of the original repo).
#ifndef SHIM_AP_AXI_SDATA_H
#define SHIM_AP_AXI_SDATA_H

#include <ap_int.h>

template <int D, int U, int TI, int TD>
struct ap_axiu {
    ap_uint<D> data;
    ap_uint<(D + 7) / 8> keep;
    ap_uint<(D + 7) / 8> strb;
    ap_uint<(U > 0 ? U : 1)> user;
    ap_uint<1> last;
    ap_uint<(TI > 0 ? TI : 1)> id;
    ap_uint<(TD > 0 ? TD : 1)> dest;
};

template <int D, int U, int TI, int TD>
struct ap_axis {
    ap_int<D> data;
    ap_uint<(D + 7) / 8> keep;
    ap_uint<(D + 7) / 8> strb;
    ap_uint<(U > 0 ? U : 1)> user;
    ap_uint<1> last;
    ap_uint<(TI > 0 ? TI : 1)> id;
    ap_uint<(TD > 0 ? TD : 1)> dest;
};

#endif
