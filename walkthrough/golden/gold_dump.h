// Runtime for the tensor dumps inserted (additively) into the patched copy of qcsnn24_rrboth_sd.h.
// Record layout (little endian), self-describing so the Node verifier needs no side table:
//   u8 taglen | tag bytes | u8 stage | u8 step | u8 dtype (1 = int8, 2 = int16, 4 = int32) | u32 count | count values
// "beat" records mark the start of each beat (count = 1, value = beat index).
#pragma once
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <vector>
#include <type_traits>

struct GoldSink {
    FILE* f = nullptr;
    int stage = 1, step = 0;
    bool tensors = true;     // false: only the small "sums" records
};
inline GoldSink g_gold;

inline void gold_record(const char* tag, int dtype, const void* data, uint32_t count) {
    if (!g_gold.f) return;
    uint8_t tl = (uint8_t)std::strlen(tag);
    std::fwrite(&tl, 1, 1, g_gold.f);
    std::fwrite(tag, 1, tl, g_gold.f);
    uint8_t hdr[3] = {(uint8_t)g_gold.stage, (uint8_t)g_gold.step, (uint8_t)dtype};
    std::fwrite(hdr, 1, 3, g_gold.f);
    std::fwrite(&count, 4, 1, g_gold.f);
    std::fwrite(data, dtype, count, g_gold.f);
}

// read the whole stream, record it, then write it back unchanged (FIFO order is preserved)
template <class S>
inline void gold_tee(const char* tag, S& s) {
    if (!g_gold.tensors) return;
    size_t n = s.size();
    std::vector<int8_t> v(n);
    for (size_t i = 0; i < n; ++i) v[i] = (int8_t)(int)s.read();
    for (size_t i = 0; i < n; ++i) s.write(typename std::remove_reference<decltype(s.read())>::type((int)v[i]));
    gold_record(tag, 1, v.data(), (uint32_t)n);
}

// LIF membrane state: both banks, plus the bank flag as it is AFTER the call (the call has already toggled it)
template <class L>
inline void gold_lif(const char* tag, const L& lif) {
    if (!g_gold.tensors) return;
    lif.visit([&](const auto* v0, const auto* v1, int n, bool bank) {
        std::vector<int32_t> a(n), b(n);
        for (int i = 0; i < n; ++i) { a[i] = (int32_t)v0[i]; b[i] = (int32_t)v1[i]; }
        char t0[64], t1[64];
        std::snprintf(t0, sizeof t0, "%s.V0", tag);
        std::snprintf(t1, sizeof t1, "%s.V1", tag);
        gold_record(t0, 4, a.data(), (uint32_t)n);
        gold_record(t1, 4, b.data(), (uint32_t)n);
        int32_t bf = bank ? 1 : 0;
        char t2[64];
        std::snprintf(t2, sizeof t2, "%s.bank", tag);
        gold_record(t2, 4, &bf, 1);
    });
}

inline void gold_sums(const char* tag, const int32_t* v, int n) { gold_record(tag, 4, v, (uint32_t)n); }

#define GOLD_STEP(st, t) do { g_gold.stage = (st); g_gold.step = (t); } while (0)
#define GOLD_TEE(tag, s) gold_tee(tag, s)
#define GOLD_LIF(tag, obj) gold_lif(tag, obj)
#define GOLD_SUMS2(a, b, p) do { int32_t _v[3] = {(int32_t)(a), (int32_t)(b), (int32_t)(p)}; gold_sums("sums2", _v, 3); } while (0)
#define GOLD_SUMS4(a, b, c, d, p) do { int32_t _v[5] = {(int32_t)(a), (int32_t)(b), (int32_t)(c), (int32_t)(d), (int32_t)(p)}; gold_sums("sums4", _v, 5); } while (0)
