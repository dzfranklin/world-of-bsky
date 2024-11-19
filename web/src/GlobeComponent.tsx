import {useEffect, useRef, useState} from "react";
import {geoClipCircle, geoGraticule, geoPath, GeoStream} from "d3";
import {geoSatellite} from "d3-geo-projection";
import * as topojson from "topojson-client";
import type GeoJSON from "geojson";
import {GeoPermissibleObjects} from "d3-geo";
import {Orbit} from "./schema.ts";

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

export function GlobeComponent({orbit}: { orbit?: Orbit }) {
  if (!orbit) orbit = 'North';

  const containerRef = useRef<HTMLDivElement>(null);

  const [land, setLand] = useState<GeoJSON.Feature | undefined>();
  useEffect(() => {
    let abort = new AbortController();
    fetch("https://cdn.jsdelivr.net/npm/world-atlas@1/world/50m.json", {signal: abort.signal})
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


    requestAnimationFrame(function loop() {
      if (stopped) return;
      const params = paramsRef.current;

      // TODO: use time
      params.longitude = (params.longitude + 180 + 0.2) % 360 - 180;

      render(context, land, params);

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

function render(ctx: CanvasRenderingContext2D, land: GeoJSON.Feature, params: RenderParams) {
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
    const tilt = params.tilt / degrees;
    const alpha = Math.acos(snyderP * Math.cos(tilt) * 0.999);
    const clipDistance = geoClipCircle(Math.acos(1 / snyderP) - 1e-6);
    preclip = alpha ? geoPipeline(
      clipDistance,
      geoRotatePhi(Math.PI + tilt),
      geoClipCircle(Math.PI - alpha - 1e-4), // Extra safety factor needed for large tilt values
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

  ctx.fillStyle = "#88d";
  ctx.beginPath();
  path(land);
  ctx.fill();

  ctx.beginPath();
  path(grid.major);
  ctx.strokeStyle = "#ddf";
  ctx.globalAlpha = 0.8;
  ctx.stroke();

  ctx.beginPath();
  path(grid.horizon);
  ctx.strokeStyle = "#000";
  ctx.stroke();
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
