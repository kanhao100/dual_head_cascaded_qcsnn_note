// CSV -> the kernel's real input words, using the authors' own FileReader (filereader24.h) for the float32 quantisation.
// Output: <words.bin>   188 int8 per beat = 180 signal + 4 RR (stage-1 scale) + 4 RR (stage-2 scale)
//         <labels.txt>  one label per line (0 normal, 1 sveb, 2 veb, 3 f)
#include <cstdio>
#include <cstdint>
#include "filereader24.h"
using namespace hls4csnn1d_cblk_sd;

int main(int argc, char** argv) {
    if (argc < 4) { std::fprintf(stderr, "usage: make_words <dir> <words.bin> <labels.txt>\n"); return 2; }
    FileReader r;
    r.loadData(argv[1]);
    FILE* f = std::fopen(argv[2], "wb");
    FILE* g = std::fopen(argv[3], "w");
    for (size_t n = 0; n < r.X.size(); ++n) {
        int8_t buf[188];
        for (int k = 0; k < 180; ++k) buf[k] = (int8_t)(int)r.X[n][k];
        for (int k = 0; k < 4; ++k) buf[180 + k] = (int8_t)(int)r.getRRStage1(n)[k];
        for (int k = 0; k < 4; ++k) buf[184 + k] = (int8_t)(int)r.getRRStage2(n)[k];
        std::fwrite(buf, 1, 188, f);
        std::fprintf(g, "%d\n", r.y[n]);
    }
    std::fclose(f);
    std::fclose(g);
    std::printf("beats: %zu\n", r.X.size());
    return 0;
}
