import collections
from threading import Lock

from prometheus_client import Counter, Gauge

INGEST_EVENTS = Counter("ingest_incoming_events_counter", "Events received (may be dropped)")
INGEST_DROPPED_EVENTS = Counter("ingest_dropped_events_counter", "Events that had to be dropped during ingest")
INGEST_QUEUE_LENGTH = Gauge("ingest_queue_length_counter", "The number of events waiting in the ingest queue")


class IngestQueue:
    BUFFER_SIZE = 100

    _mu = Lock()
    _q = collections.deque()

    def push(self, event):
        with self._mu:
            INGEST_EVENTS.inc()
            self._q.append(event)
            if len(self._q) > self.BUFFER_SIZE:
                self._q.popleft()
                INGEST_DROPPED_EVENTS.inc()
            INGEST_QUEUE_LENGTH.set(len(self._q))

    def pop(self):
        with self._mu:
            event = self._q.popleft()
            INGEST_QUEUE_LENGTH.set(len(self._q))
            return event
