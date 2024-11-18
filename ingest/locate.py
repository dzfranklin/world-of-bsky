import itertools
import urllib.parse
from functools import lru_cache
from typing import Optional, Any

import requests
from pydantic import BaseModel, Field
from stanza.models.common.doc import Document
from prometheus_client import Histogram

from request_limiter import ThreadRequestLimiter

USER_AGENT = "github.com/dzfranklin/world-of-bsky (daniel@danielzfranklin.org)"


GEOCODE_DOC_TIME = Histogram("geocode_doc_seconds_histogram", "The amount of time it takes to geocode a parsed document")


class OSMEntity(BaseModel):
    osm_type: str
    osm_id: int
    lat: str
    lon: str
    category: str
    type: str
    name: str
    display_name: str
    boundingbox: list[str]


class LocatedEntity(BaseModel):
    text: str
    start_char: int
    end_char: int
    nlp_type: str = Field(serialization_alias="_nlp_type")
    closest_gpe: Optional[str] = Field(serialization_alias="_closest_gpe")
    osm: OSMEntity


@GEOCODE_DOC_TIME.time()
def locate(doc: Document) -> LocatedEntity:
    gpes = [(i, ent) for (i, ent) in enumerate(doc.entities) if ent.type == "GPE"]

    priority_candidates = []
    secondary_candidates = []
    for i, ent in enumerate(doc.entities):
        if ent.type in ["FAC", "LOC"]:
            closest_gpe: Any = min(
                [(abs(gpe_i - i), gpe) for (gpe_i, gpe) in gpes],
                default=(-1, None),
                key=lambda pair: pair[0]
            )[1]
            priority_candidates.append((ent, closest_gpe))
        elif ent.type == "GPE":
            secondary_candidates.append((ent, None))

    for (ent, closest_gpe) in itertools.chain(priority_candidates, secondary_candidates):
        query = ent.text
        if closest_gpe:
            query += ", " + closest_gpe.text

        osm_entity = geocode(query)

        if osm_entity:
            return LocatedEntity(
                text=ent.text,
                start_char=ent.start_char,
                end_char=ent.end_char,
                nlp_type=ent.type,
                osm=osm_entity,
                closest_gpe=closest_gpe.text if closest_gpe is not None else None,
            )


nominatim_limit = ThreadRequestLimiter(1_500)


@lru_cache(maxsize=10_000)
def geocode(query: str) -> Optional[OSMEntity]:
    with nominatim_limit:
        print('querying nominatim: ', query)

        params = {
            "q": query,
            "format": "jsonv2",
            "limit": 1,
        }

        headers = {
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-US,en"
        }

        resp = requests.get("https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(params),
                            headers=headers)
        results = resp.json()

        if len(results) > 0:
            return OSMEntity(**resp.json()[0])
