declare module 'd3-geo-projection' {
  import type {GeoProjection} from "d3";

  type GeoSatelliteProjection = GeoProjection & {
    distance: (_: number) => GeoSatelliteProjection;
    tilt: (_: number) => GeoSatelliteProjection
  }

  function geoSatellite(): GeoSatelliteProjection;
}
