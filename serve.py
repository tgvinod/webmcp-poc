#!/usr/bin/env python3
"""Tiny local static server for the WebMCP POC.
Binds to localhost only and adds basic security headers.
Usage:  python3 serve.py        (then open http://localhost:8000)
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8000


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; script-src 'self'; style-src 'self'; "
                         "img-src 'self' data:; object-src 'none'; base-uri 'none'; "
                         "frame-ancestors 'none'; form-action 'self'")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Cache-Control", "no-store")  # always fresh while iterating
        super().end_headers()


if __name__ == "__main__":
    with ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as srv:
        print(f"Serving on http://localhost:{PORT}  (Ctrl+C to stop)")
        srv.serve_forever()
