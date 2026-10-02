// Forced-include shim for Vitis HLS on Windows (MinGW headers).
// filereader24.h is a host-only CSV reader that modeleval24_sd.h pulls into the synthesis translation unit.
// It includes <filesystem>, <dirent.h> and calls POSIX mkdir(path, mode), none of which the bundled MinGW 8.3
// headers accept in the HLS front end. The synthesizable path never uses FileReader (checked by grep), so
// pre-defining its include guard makes the preprocessor skip the whole file. Upstream sources stay untouched.
#ifndef SKIP_HOST_READER_SHIM_H
#define SKIP_HOST_READER_SHIM_H
#define FILE_READER_H
#endif
