import { loadGraph, type LatLng } from "./graph-data";
export * from "./graph-data";

// Optional at build time so a checkout without downloaded data still builds.
const files = import.meta.glob("../data/bohol-graph.json", { eager: true, import: "default" });
let loaded: ReturnType<typeof loadGraph> = { cities: [], inaccessible: [], edges: [], graph: {} };
let error = "";
try {
  const raw = files["../data/bohol-graph.json"];
  if (!raw) throw new Error("Bohol road data is missing");
  loaded = loadGraph(raw);
} catch (cause) {
  error = `${cause instanceof Error ? cause.message : "Invalid Bohol data"}. Run npm run build:data, then restart the dev server or rebuild the app.`;
}
export const GRAPH_ERROR = error;
export const CITIES = loaded.cities;
export const INACCESSIBLE_CITIES = loaded.inaccessible;
export const EDGES = loaded.edges;
export const GRAPH = loaded.graph;
export const cityByName = new Map(CITIES.map((c) => [c.name, c]));
const roads = new Map(EDGES.map((e) => [[e.a, e.b].sort().join("|"), e]));
const reverseRoads = new Map(EDGES.map((e) => [e, [...e.geometry].reverse()]));
const directedSegments = new Map(
  EDGES.flatMap(
    (e) =>
      [
        [`${e.a}|${e.b}`, { road: e.road, access: e.access }],
        [
          `${e.b}|${e.a}`,
          {
            road: [...e.road].reverse(),
            access: [...e.access].reverse().map((line) => [...line].reverse()),
          },
        ],
      ] as const,
  ),
);
export function roadSegments(from: string, to: string) {
  return directedSegments.get(`${from}|${to}`);
}
export function roadGeometry(from: string, to: string): LatLng[] {
  const road = roads.get([from, to].sort().join("|"));
  return road ? (road.a === from ? road.geometry : reverseRoads.get(road)!) : [];
}

/** Register each additional province dataset here. */
export const PROVINCE_DATASETS = { Bohol: { id: "bohol", label: "Bohol" } } as const;
export type MapView = "philippines" | typeof PROVINCE_DATASETS.Bohol.id;
