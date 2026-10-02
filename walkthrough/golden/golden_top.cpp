// Drive the UNMODIFIED topFunction (csnn_cpp/.../topclass24_sd.cpp) with raw input words, exactly like the authors'
// AXI testbench (input_row_to_axi): 188 int8 words packed 8 per 64-bit beat -> 24 beats, TLAST on the last.
// Output per beat: pred2 (0 normal / 1 abnormal) and pred4 (0..3), read from the two output streams.
#include <cstdio>
#include <cstdint>
#include <vector>
#include "cblk_sd/topclass24_sd.cpp"   // defines topFunction (+ pulls in the whole kernel)

int main(int argc, char** argv) {
    if (argc < 3) { std::fprintf(stderr, "usage: golden_top <words.bin> <preds.txt>\n"); return 2; }
    FILE* f = std::fopen(argv[1], "rb");
    std::vector<int8_t> buf;
    int8_t tmp[188];
    while (std::fread(tmp, 1, 188, f) == 188) buf.insert(buf.end(), tmp, tmp + 188);
    std::fclose(f);
    const size_t N = buf.size() / 188;
    FILE* o = std::fopen(argv[2], "w");
    for (size_t n = 0; n < N; ++n) {
        hls::stream<axi_fixed_t> in, out2, out4;
        const int8_t* b = &buf[n * 188];
        for (int w = 0; w < 24; ++w) {
            axi_fixed_t word;
            word.data = 0; word.keep = 0; word.strb = 0; word.last = 0;
            for (int j = 0; j < 8; ++j) {
                int idx = w * 8 + j;
                ap_uint<8> byte_val = 0;
                if (idx < 188) { byte_val = (ap_uint<8>)(uint8_t)b[idx]; word.keep |= (ap_uint<8>)(1u << j); }
                word.data.range(j * 8 + 7, j * 8) = byte_val;
            }
            word.strb = word.keep;
            if (w == 23) word.last = 1;
            in.write(word);
        }
        topFunction(in, out2, out4);
        axi_fixed_t w2 = out2.read(), w4 = out4.read();
        int p2 = (int)(int8_t)(uint8_t)w2.data.range(7, 0).to_uint();
        int p4 = (int)(int8_t)(uint8_t)w4.data.range(7, 0).to_uint();
        std::fprintf(o, "%d %d\n", p2, p4);
        if ((n + 1) % 200 == 0) { std::fprintf(stderr, "%zu/%zu\n", n + 1, N); }
    }
    std::fclose(o);
    std::printf("beats: %zu\n", N);
    return 0;
}
