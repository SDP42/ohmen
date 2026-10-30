import * as maplibregl from "maplibre-gl";
// MapLibre 6 runs tiles in an ES-module worker. Bundle it through Vite and register its URL,
// otherwise dependency pre-bundling breaks the worker's relative path.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

maplibregl.setWorkerUrl(workerUrl);

export default maplibregl;
