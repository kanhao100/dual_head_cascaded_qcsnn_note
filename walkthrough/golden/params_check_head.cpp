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
