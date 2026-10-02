"""Serve only the standalone walkthrough over loopback HTTP.

Run ``python walkthrough/preview.py`` and open the printed URL. Stop with Ctrl+C.
No directory listing, uploads, proxy, or files other than the HTML are exposed.
"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


PAGE = Path(__file__).resolve().with_name("qcsnn_kernel_walkthrough.html")
ROUTE = "/qcsnn_kernel_walkthrough.html"


class PageHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._page(False)

    def do_HEAD(self):
        self._page(True)

    def _page(self, head):
        if urlsplit(self.path).path != ROUTE:
            self.send_error(404, "This preview only serves the walkthrough HTML")
            return
        try:
            content = PAGE.read_bytes()
        except OSError:
            self.send_error(503, "Build the walkthrough before previewing it")
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if not head:
            try:
                self.wfile.write(content)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def log_message(self, fmt, *args):
        print("preview:", fmt % args, flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error("port must be in 0..65535")
    if not PAGE.is_file():
        parser.error("build qcsnn_kernel_walkthrough.html first")
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), PageHandler)
    except OSError:
        server = ThreadingHTTPServer(("127.0.0.1", 0), PageHandler)
    print(f"http://127.0.0.1:{server.server_port}{ROUTE}", flush=True)
    print("Loopback only; Ctrl+C stops this preview.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Preview stopped.", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
