// Minimal CPU-only stand-in for Xilinx <hls_stream.h>, for running the C++ testbench
// without Vitis. Not part of the original repo. Only implements what the QCSNN
// sources use: write / read / empty / full / size / operator<< / operator>>.
#ifndef SHIM_HLS_STREAM_H
#define SHIM_HLS_STREAM_H

#include <cstddef>
#include <queue>

namespace hls {

template <typename T, int DEPTH = 0>
class stream {
  public:
    stream() {}
    explicit stream(const char*) {}

    void write(const T& v) { q_.push(v); }
    T read() {
        T v = q_.front();
        q_.pop();
        return v;
    }
    bool read_nb(T& v) {
        if (q_.empty()) return false;
        v = q_.front();
        q_.pop();
        return true;
    }
    bool write_nb(const T& v) { q_.push(v); return true; }
    bool empty() const { return q_.empty(); }
    bool full() const { return false; }
    std::size_t size() const { return q_.size(); }

    void operator<<(const T& v) { write(v); }
    void operator>>(T& v) { v = read(); }

  private:
    std::queue<T> q_;
};

}  // namespace hls

#endif
