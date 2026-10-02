// Prints a checksum of every integer constant array the kernel uses, for cross-checking parse_params.py.
#include <cstdio>
#include <type_traits>
#include <ap_int.h>
#include "cblk_sd/includeheaders24_sd.h"
using namespace hls4csnn1d_cblk_sd;

template <class A>
void chk(const char* n, const A& a) {
    using E = typename std::remove_all_extents<A>::type;
    const E* p = reinterpret_cast<const E*>(&a);
    size_t cnt = sizeof(A) / sizeof(E);
    long long s = 0, w = 0;
    for (size_t i = 0; i < cnt; ++i) {
        long long v = (long long)p[i];
        s += v;
        w += (long long)(i + 1) * v;
    }
    std::printf("%s %zu %lld %lld\n", n, cnt, s, w);
}

int main() {
    chk("qcsnet24_cblk1_batch_norm_bias", qcsnet24_cblk1_batch_norm_bias);
    chk("qcsnet24_cblk1_batch_norm_right_shift", qcsnet24_cblk1_batch_norm_right_shift);
    chk("qcsnet24_cblk1_batch_norm_scale_multiplier", qcsnet24_cblk1_batch_norm_scale_multiplier);
    chk("qcsnet24_cblk1_batch_norm_weight", qcsnet24_cblk1_batch_norm_weight);
    chk("qcsnet24_cblk1_qconv1d_bias", qcsnet24_cblk1_qconv1d_bias);
    chk("qcsnet24_cblk1_qconv1d_right_shift", qcsnet24_cblk1_qconv1d_right_shift);
    chk("qcsnet24_cblk1_qconv1d_scale_multiplier", qcsnet24_cblk1_qconv1d_scale_multiplier);
    chk("qcsnet24_cblk1_qconv1d_weight_sum", qcsnet24_cblk1_qconv1d_weight_sum);
    chk("qcsnet24_cblk1_qconv1d_weights", qcsnet24_cblk1_qconv1d_weights);
    chk("qcsnet24_cblk2_batch_norm_bias", qcsnet24_cblk2_batch_norm_bias);
    chk("qcsnet24_cblk2_batch_norm_right_shift", qcsnet24_cblk2_batch_norm_right_shift);
    chk("qcsnet24_cblk2_batch_norm_scale_multiplier", qcsnet24_cblk2_batch_norm_scale_multiplier);
    chk("qcsnet24_cblk2_batch_norm_weight", qcsnet24_cblk2_batch_norm_weight);
    chk("qcsnet24_cblk2_qconv1d_bias", qcsnet24_cblk2_qconv1d_bias);
    chk("qcsnet24_cblk2_qconv1d_right_shift", qcsnet24_cblk2_qconv1d_right_shift);
    chk("qcsnet24_cblk2_qconv1d_scale_multiplier", qcsnet24_cblk2_qconv1d_scale_multiplier);
    chk("qcsnet24_cblk2_qconv1d_weight_sum", qcsnet24_cblk2_qconv1d_weight_sum);
    chk("qcsnet24_cblk2_qconv1d_weights", qcsnet24_cblk2_qconv1d_weights);
    chk("qcsnet24_cblk3_batch_norm_bias", qcsnet24_cblk3_batch_norm_bias);
    chk("qcsnet24_cblk3_batch_norm_right_shift", qcsnet24_cblk3_batch_norm_right_shift);
    chk("qcsnet24_cblk3_batch_norm_scale_multiplier", qcsnet24_cblk3_batch_norm_scale_multiplier);
    chk("qcsnet24_cblk3_batch_norm_weight", qcsnet24_cblk3_batch_norm_weight);
    chk("qcsnet24_cblk3_qconv1d_bias", qcsnet24_cblk3_qconv1d_bias);
    chk("qcsnet24_cblk3_qconv1d_right_shift", qcsnet24_cblk3_qconv1d_right_shift);
    chk("qcsnet24_cblk3_qconv1d_scale_multiplier", qcsnet24_cblk3_qconv1d_scale_multiplier);
    chk("qcsnet24_cblk3_qconv1d_weight_sum", qcsnet24_cblk3_qconv1d_weight_sum);
    chk("qcsnet24_cblk3_qconv1d_weights", qcsnet24_cblk3_qconv1d_weights);
    chk("qcsnet2_lblk1_qlinear_bias", qcsnet2_lblk1_qlinear_bias);
    chk("qcsnet2_lblk1_qlinear_right_shift", qcsnet2_lblk1_qlinear_right_shift);
    chk("qcsnet2_lblk1_qlinear_scale_multiplier", qcsnet2_lblk1_qlinear_scale_multiplier);
    chk("qcsnet2_lblk1_qlinear_weight_sum", qcsnet2_lblk1_qlinear_weight_sum);
    chk("qcsnet2_lblk1_qlinear_weights", qcsnet2_lblk1_qlinear_weights);
    chk("qcsnet4_lblk1_qlinear_bias", qcsnet4_lblk1_qlinear_bias);
    chk("qcsnet4_lblk1_qlinear_right_shift", qcsnet4_lblk1_qlinear_right_shift);
    chk("qcsnet4_lblk1_qlinear_scale_multiplier", qcsnet4_lblk1_qlinear_scale_multiplier);
    chk("qcsnet4_lblk1_qlinear_weight_sum", qcsnet4_lblk1_qlinear_weight_sum);
    chk("qcsnet4_lblk1_qlinear_weights", qcsnet4_lblk1_qlinear_weights);
    chk("qcsnet4_lblk2_qlinear_bias", qcsnet4_lblk2_qlinear_bias);
    chk("qcsnet4_lblk2_qlinear_right_shift", qcsnet4_lblk2_qlinear_right_shift);
    chk("qcsnet4_lblk2_qlinear_scale_multiplier", qcsnet4_lblk2_qlinear_scale_multiplier);
    chk("qcsnet4_lblk2_qlinear_weight_sum", qcsnet4_lblk2_qlinear_weight_sum);
    chk("qcsnet4_lblk2_qlinear_weights", qcsnet4_lblk2_qlinear_weights);
    return 0;
}
