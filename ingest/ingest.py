import collections
import json
import re
import ssl
import threading
from typing import Callable, Any

import LanguageIdentifier
import certifi
import stanza
from prometheus_client import Gauge, Counter, Histogram
from pydantic import BaseModel
from websockets.sync.client import connect

from locate import locate, LocatedEntity


class LocatedImage(BaseModel):
    entity: LocatedEntity
    image: Any
    event: Any


POST_FEED = "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post"
ENTITIES_OF_INTEREST = ["GPE", ]  # maybe NORP, EVENT?
NON_LANGUAGE_RE = re.compile(r"[#@]\w+")

_nlp = stanza.Pipeline('en',
                       download_method=stanza.DownloadMethod.REUSE_RESOURCES, logging_level='ERROR')

_mu = threading.Lock()
_cond = threading.Condition(_mu)
_commits_with_images = collections.deque(maxlen=100)

_receivers_mu = threading.Lock()
_receivers: set[Callable[[LocatedImage], None]] = set()

RECEIVERS = Gauge("receivers_counter", "The number of receivers registered to receive processed events")
COMMITS_WITH_IMAGES = Counter("processed_events_counter", "The number of events processed")
IMAGES_WITH_ENGLISH_ALT = Counter("images_with_english_alt_counter", "Images with English alt text")
IMAGES_WITH_ALT_LOCATION = Counter("images_with_alt_location_counter", "Images with a location in the alt text")
NLP_PROCESSING_TIME = Histogram("nlp_processing_seconds_histogram", "The amount of time it takes to process a single text")


def register_receiver(cb: Callable[[LocatedImage], None]):
    with _receivers_mu:
        _receivers.add(cb)
        RECEIVERS.set(len(_receivers))


def unregister_receiver(cb: Callable[[LocatedImage], None]):
    with _receivers_mu:
        _receivers.remove(cb)
        RECEIVERS.set(len(_receivers))


def _is_english(text: str) -> bool:
    text = NON_LANGUAGE_RE.sub("", text).strip()
    if text == "":
        return False
    return LanguageIdentifier.predict(text) == "en"


def run_accept():
    ssl_ctx = ssl.create_default_context(cafile=certifi.where())
    with (connect(POST_FEED, ssl=ssl_ctx) as ws):
        while True:
            value = ws.recv(timeout=60 * 30)
            event = json.loads(value)

            if event["kind"] == "commit":
                commit = event["commit"]
                if "record" in commit and \
                        "embed" in commit["record"] and \
                        "images" in commit["record"]["embed"]:
                    with _mu:
                        _commits_with_images.append(event)
                        _cond.notify()

                        COMMITS_WITH_IMAGES.inc()


def run_extract():
    while True:
        with _mu:
            while len(_commits_with_images) == 0:
                _cond.wait()
            event = _commits_with_images.popleft()

        for image in event["commit"]["record"]["embed"]["images"]:
            alt = image["alt"]
            if alt == "" or not _is_english(alt):
                continue
            IMAGES_WITH_ENGLISH_ALT.inc()

            with NLP_PROCESSING_TIME.time():
                doc = _nlp(alt)

            loc = locate(doc)

            if loc:
                IMAGES_WITH_ALT_LOCATION.inc()
                located_image = LocatedImage(entity=loc, event=event, image=image)
                with _receivers_mu:
                    for cb in _receivers:
                        cb(located_image)
