import {useEffect, useMemo, useRef, useState} from "react";
import {geoClipCircle, geoGraticule, geoPath, GeoStream} from "d3";
import {geoSatellite} from "d3-geo-projection";
import * as topojson from "topojson-client";
import type GeoJSON from "geojson";
import {GeoPermissibleObjects} from "d3-geo";
import {ImageEntrySchema, Orbit} from "./schema.ts";
import {ImageProvider} from "./ImageProvider.ts";

// Based on <https://observablehq.com/@jjhembd/tilting-the-satellite>

const earthRadius = 6371; // Spherical approximation: average radius in km
const degrees = 180 / Math.PI;

const defaultRenderParams: RenderParams = {
  longitude: -85.0,
  latitude: 0,
  altitude: 5000,
  rotation: 16,
  tilt: 20,
  fieldOfView: 40,
}

const sampleImage = ImageEntrySchema.parse({
    "entity": {
      "text": "Houston",
      "start_char": 91,
      "end_char": 98,
      "_nlp_type": "GPE",
      "osm": {
        "osm_type": "relation",
        "osm_id": 2688911,
        "lat": "29.7589382",
        "lon": "-95.3676974",
        "category": "boundary",
        "type": "administrative",
        "name": "Houston",
        "display_name": "Houston, Harris County, Texas, United States",
        "boundingbox": [
          "29.5370705",
          "30.1103506",
          "-95.9097419",
          "-95.0120525"
        ]
      }
    },
    "image": {
      "alt": "Photo of me and a friend from a photo shoot for Danny out for life supporting a foundation Houston",
      "aspectRatio": {
        "height": 1207,
        "width": 1207
      },
      "image": {
        "$type": "blob",
        "ref": {
          "$link": "bafkreih7jmdh6ihubhnzg65bwfd7ct26ejsmp7ksqvndrudl2ymad332pi"
        },
        "mimeType": "image/jpeg",
        "size": 586406
      }
    },
    "event": {
      "did": "did:plc:uas6hwpiwfhkep62baacgx5m",
      "time_us": 1731965355698301,
      "type": "com",
      "kind": "commit",
      "commit": {
        "rev": "3lbauhvf6yj2c",
        "type": "c",
        "operation": "create",
        "collection": "app.bsky.feed.post",
        "rkey": "3lbauhtrpys2e",
        "record": {
          "$type": "app.bsky.feed.post",
          "createdAt": "2024-11-18T21:29:12.663Z",
          "embed": {
            "$type": "app.bsky.embed.images",
            "images": [
              {
                "alt": "Photo of me and a friend from a photo shoot for Danny out for life supporting a foundation Houston",
                "aspectRatio": {
                  "height": 1207,
                  "width": 1207
                },
                "image": {
                  "$type": "blob",
                  "ref": {
                    "$link": "bafkreih7jmdh6ihubhnzg65bwfd7ct26ejsmp7ksqvndrudl2ymad332pi"
                  },
                  "mimeType": "image/jpeg",
                  "size": 586406
                }
              }
            ]
          },
          "langs": [
            "en"
          ],
          "reply": {
            "parent": {
              "cid": "bafyreia6dhybgyjnvsmhwen7yfnerkmwxfl5f54kl7wvvu5vcvipkqnfwy",
              "uri": "at://did:plc:nflf7lzmbqjjlz6uks5btopf/app.bsky.feed.post/3lbau5byy4k2h"
            },
            "root": {
              "cid": "bafyreicuaymvevkbrrdapsd5b5b7iflikjy6qea2g25gzn6tw3lzsanmsa",
              "uri": "at://did:plc:uas6hwpiwfhkep62baacgx5m/app.bsky.feed.post/3lb6j3f7ur22d"
            }
          },
          "text": "You’re a hoot!  I’m more clown than model for sure. Well, maybe the before model in a surgeons ad 😂"
        },
        "cid": "bafyreiaat7dbh4l4gbwtstfk5qx5cyancmdgs7jl2dkl5dzikkqt6azth4"
      }
    }
  }
);

export function GlobeComponent({orbit}: { orbit?: Orbit }) {
  if (!orbit) orbit = 'North';

  const containerRef = useRef<HTMLDivElement>(null);

  const [land, setLand] = useState<GeoJSON.Feature | undefined>();
  useEffect(() => {
    let abort = new AbortController();
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@1/world/110m.json", {signal: abort.signal})
      .then(response => response.json())
      .then(world => {
        if (abort.signal.aborted) return;
        setLand(topojson.feature(world, world.objects.land));
      }).catch(err => {
      if (abort.signal.aborted) return;
      throw err;
    });
    return () => {
      abort.abort()
    }
  }, []);

  const images = useMemo(() => new ImageProvider(), []);
  useEffect(() => {
    // TODO: fixme
    images.add(sampleImage)
  }, []);


  const [width, setWidth] = useState<number | undefined>();
  const [height, setHeight] = useState<number | undefined>();
  useEffect(() => {
    const setSize = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };
    addEventListener("resize", setSize);
    setSize();
    return () => {
      window.removeEventListener("resize", setSize);
    }
  }, []);

  const [context, setContext] = useState<CanvasRenderingContext2D | undefined>();
  useEffect(() => {
    if (!containerRef.current || width === undefined || height === undefined) return;
    const val = context2d(width, height);
    setContext(val);
    containerRef.current.append(val.canvas);
    return () => {
      val.canvas.remove();
    }
  }, [width, height]);

  const paramsRef = useRef(defaultRenderParams);

  useEffect(() => {
    switch (orbit) {
      case "North":
        paramsRef.current.latitude = 25;
        break;
      case "Equator":
        paramsRef.current.latitude = 0;
        break;
      case "South":
        paramsRef.current.latitude = -50;
        break;
    }
  }, [orbit]);

  useEffect(() => {
    if (!land || !context) return;

    let stopped = false;
    let lastT: number | null = null;
    requestAnimationFrame(function loop(t) {
      if (stopped) return;
      const params = paramsRef.current;
      const dt = lastT ? t - lastT : 0;

      params.longitude = (params.longitude + 180 + dt*.01) % 360 - 180;

      render(context, land, images, params);
      lastT = t;
      requestAnimationFrame(loop);
    })

    return () => {
      stopped = true;
    }
  }, [land, context]);

  return <div ref={containerRef}></div>
}

interface RenderParams {
  longitude: number;
  latitude: number;
  altitude: number;
  rotation: number;
  tilt: number;
  fieldOfView: number;
}

const grid: Record<string, GeoPermissibleObjects> = {
  major: geoGraticule().step([15, 15])(),
  minor: geoGraticule().step([5, 5])(),
  horizon: ({type: "Sphere"})
}

function render(ctx: CanvasRenderingContext2D, land: GeoJSON.Feature, images: ImageProvider, params: RenderParams) {
  ctx.reset();

  const height = ctx.canvas.height;
  const width = ctx.canvas.width;

  const snyderP = 1.0 + params.altitude / earthRadius;

  const dY = params.altitude * Math.sin(params.tilt / degrees);
  const dZ = params.altitude * Math.cos(params.tilt / degrees);
  const visibleYextent = 2 * dZ * Math.tan(0.5 * params.fieldOfView / degrees);
  const scale = earthRadius * height / visibleYextent;
  const yShift = dY * height / visibleYextent;

  let preclip: (_: GeoStream) => GeoStream;
  {
    const distance = snyderP;
    const tilt = params.tilt * Math.PI / 180;
    const alpha = Math.acos(distance * Math.cos(tilt) * 0.999);
    const clipDistance = geoClipCircle(Math.acos(1 / distance) - 1e-6);
    preclip = alpha ? geoPipeline(
      clipDistance,
      geoRotatePhi(Math.PI + tilt),
      geoClipCircle(Math.PI - alpha),
      geoRotatePhi(-Math.PI - tilt)
    ) : clipDistance;
  }

  const projection = geoSatellite()
    .scale(scale)
    .translate([width / 2, yShift + height / 2])
    .rotate([-params.longitude, -params.latitude, params.rotation])
    .tilt(params.tilt)
    .distance(snyderP)
    .preclip(preclip)
    .precision(0.1)

  const path = geoPath(projection, ctx);

  ctx.beginPath();
  path(grid.horizon);
  ctx.strokeStyle = "#9f9e9e";
  ctx.stroke();
  ctx.clip();

  ctx.fillStyle = "#eeeeee";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#fcfcfc";
  ctx.strokeStyle = "#bdbdbd";
  ctx.beginPath();
  path(land);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  path(grid.major);
  ctx.strokeStyle = "#ddf";
  ctx.globalAlpha = 0.8;
  ctx.stroke();

  for (const entry of images) {
    const point = projection([entry.entry.entity.osm.lon, entry.entry.entity.osm.lat])
    if (!point) continue;
    ctx.drawImage(entry.thumbnail, point[0], point[1], entry.aspectRatio * 100, 100)
  }
}

function geoPipeline(...transforms: Array<(_: GeoStream) => GeoStream>): (_: GeoStream) => GeoStream {  // Move to Appendix?
  return sink => {
    for (let i = transforms.length - 1; i >= 0; --i) {
      sink = transforms[i](sink);
    }
    return sink;
  };
}

function geoRotatePhi(deltaPhi: number): (_: GeoStream) => GeoStream {
  const cosDeltaPhi = Math.cos(deltaPhi);
  const sinDeltaPhi = Math.sin(deltaPhi);
  return sink => ({
    point(lambda, phi) {
      const cosPhi = Math.cos(phi);
      const x = Math.cos(lambda) * cosPhi;
      const y = Math.sin(lambda) * cosPhi;
      const z = Math.sin(phi);
      const k = z * cosDeltaPhi + x * sinDeltaPhi;
      sink.point(Math.atan2(y, x * cosDeltaPhi - z * sinDeltaPhi), Math.asin(k));
    },
    lineStart() {
      sink.lineStart();
    },
    lineEnd() {
      sink.lineEnd();
    },
    polygonStart() {
      sink.polygonStart();
    },
    polygonEnd() {
      sink.polygonEnd();
    },
    sphere() {
      sink.sphere?.();
    }
  });
}

function context2d(width: number, height: number, dpi?: number) {
  if (dpi === undefined) dpi = devicePixelRatio;
  const canvas = document.createElement("canvas");
  canvas.width = width * dpi;
  canvas.height = height * dpi;
  canvas.style.width = width + "px";
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Browser does not support 2d canvas")
  }
  context.scale(dpi, dpi);
  return context;
}
