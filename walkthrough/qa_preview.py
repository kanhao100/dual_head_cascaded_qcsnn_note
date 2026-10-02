"""Check the loopback preview's HTTP contract without browser automation."""
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
import socket
import subprocess
import sys
import threading

from preview import PAGE, PageHandler


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), PageHandler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        for method in ("GET", "HEAD"):
            client = HTTPConnection("127.0.0.1", server.server_port, timeout=5)
            client.request(method, "/qcsnn_kernel_walkthrough.html?qa=1")
            response = client.getresponse()
            assert response.status == 200
            assert response.getheader("Content-Type") == "text/html; charset=utf-8"
            assert response.getheader("Cache-Control") == "no-store"
            assert int(response.getheader("Content-Length")) == PAGE.stat().st_size
            body = response.read()
            assert body == (PAGE.read_bytes() if method == "GET" else b"")
            client.close()
        for route in ("/", "/params.json", "/data/words_full.bin", "/../README.md"):
            client = HTTPConnection("127.0.0.1", server.server_port, timeout=5)
            client.request("GET", route)
            response = client.getresponse()
            assert response.status == 404
            response.read()
            client.close()
        # Occupy a known port. The CLI must choose an ephemeral port without
        # terminating or replacing this listener.
        occupied = socket.socket()
        occupied.bind(("127.0.0.1", 0))
        occupied.listen()
        proc = subprocess.Popen([sys.executable, "-u", str(PAGE.with_name("preview.py")),
                                 "--port", str(occupied.getsockname()[1])],
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, encoding="utf-8")
        try:
            url = proc.stdout.readline().strip()
            assert url.startswith("http://127.0.0.1:")
            port = int(url.split(":")[2].split("/")[0])
            assert port != occupied.getsockname()[1]
            assert proc.poll() is None
        finally:
            proc.terminate()  # This test's child process only.
            proc.wait(timeout=5)
            occupied.close()
        print("PASS HTTP GET/HEAD, UTF-8, no-store, file isolation, occupied-port fallback")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
