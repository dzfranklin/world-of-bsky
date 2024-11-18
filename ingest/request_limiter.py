import time
from datetime import datetime, UTC
from threading import Lock


class ThreadRequestLimiter:
    wait_ms: float

    mu: Lock
    last_request = datetime.fromtimestamp(0, UTC)

    def __init__(self, wait_ms: float):
        self.mu = Lock()
        self.wait_ms = wait_ms

    def __enter__(self):
        self.mu.acquire_lock()
        elapsed = (datetime.now(UTC) - self.last_request).total_seconds()
        if elapsed < 1.0:
            dur = 1.0 - elapsed
            time.sleep(dur)
        self.last_request = datetime.now(UTC)

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.mu.release_lock()
