#!/usr/bin/env python
import os
import threading
import traceback

import prometheus_client
import websockets.sync.server
from typing import Callable

import ingest
from ingest import LocatedImage

host = "0.0.0.0"
port = 8000
metrics_port = 8001


def spawn_link(target: Callable):
    def runner():
        try:
            target()
        except Exception:
            traceback.print_exc()
            os._exit(0)

    t = threading.Thread(target=runner)
    t.start()


def handler(ws: websockets.sync.server.ServerConnection):
    def receiver(img: LocatedImage):
        ws.send(img.model_dump_json(by_alias=True))

    ingest.register_receiver(receiver)
    try:
        for _msg in ws:
            pass
    finally:
        ingest.unregister_receiver(receiver)


def run_serve():
    print(f"Listening on {host}:{port}")
    print(f"Metrics available at {host}:{port}")
    print("\n")

    with websockets.sync.server.serve(handler, host=host, port=port) as server:
        server.serve_forever()


def run():
    prometheus_client.start_http_server(metrics_port, host)

    spawn_link(ingest.run_accept)
    spawn_link(ingest.run_extract)
    spawn_link(run_serve)


if __name__ == "__main__":
    run()
