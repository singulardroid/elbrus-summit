# Data sources & licences

Every source below is free to use, but each one **requires attribution**. The viewer must always
show an attribution footer with the text in the last section.

## Elevation: Copernicus DEM GLO-30
- ~30 m (1 arc-second) global surface model (DSM: includes glacier/snow surface).
- Access: AWS Open Data, bucket `s3://copernicus-dem-30m/` (public, no credentials needed).
  Tiles are 1° × 1° Cloud-Optimized GeoTIFFs named like
  `Copernicus_DSM_COG_10_N43_00_E042_00_DEM`.
- The core Elbrus bbox fits inside tile **N43 E042**. The optional 100 km horizon ring needs
  neighbouring tiles (N42/N43/N44 × E041/E042/E043).
- Fallback / cross-check: ALOS AW3D30 (JAXA), NASADEM.

## Imagery: Sentinel-2 L2A
- 10 m true colour (bands B04/B03/B02), surface reflectance.
- Access: STAC API (Element84 Earth Search `https://earth-search.aws.element84.com/v1`,
  collection `sentinel-2-l2a`) or Microsoft Planetary Computer.
- Scene selection: Aug–Sep (least seasonal snow, glaciers visible), cloud cover < 5 %
  over the bbox; mosaic several dates if needed.

## POIs, trails, lifts, huts: OpenStreetMap
- Access: Overpass API query over the bbox for `natural=peak|glacier|saddle`,
  `tourism=alpine_hut|viewpoint`, `aerialway=*`, `highway=path`, `place=*`.
- Used to **seed** `content/pois.geojson`; the final list is curated by hand.
- Also the source of the route geometry (`content/routes.yaml` lists the OSM way ids).
- Licence: ODbL. Place coordinates and route lines derived from OSM stay under ODbL if published as data.

## Not used: Google Earth / Google Photorealistic 3D Tiles
Licensed for live streaming only. Extracting, caching or self-hosting is not permitted.
It could be added later only as a streamed layer with a Google API key (see PLAN.md §1).

## Attribution text (viewer footer)
> Elevation: Copernicus DEM © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018,
> provided under COPERNICUS by the European Union and ESA ·
> Imagery: contains modified Copernicus Sentinel data 2025 ·
> Map data © OpenStreetMap contributors

Before launch, check this text against each provider's current attribution requirements.
