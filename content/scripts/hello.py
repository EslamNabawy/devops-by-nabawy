"""
hello.py — Containerized Python service for Floci (AWS simulator)
Entry point for the Docker image deployed via Jenkins pipeline.
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
import os

PORT = int(os.getenv("PORT", "8081"))

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-type", "text/plain")
        self.end_headers()
        msg = f"Hello from Floci! Python app running on port {PORT}\n"
        self.wfile.write(msg.encode())
    def log_message(self, format, *args):
        print(f"[hello-app] {self.client_address[0]} - {format % args}")

if __name__ == "__main__":
    print(f"Starting hello-app on 0.0.0.0:{PORT} ...")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
