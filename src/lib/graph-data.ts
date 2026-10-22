import { z } from "zod";

export type LatLng = [number, number];
export interface City {
  id: string;
  name: string;
  lat: number;
  lon: number;
}
export type EdgeKind = "road";
export interface GraphEdge {
  a: string;
  b: string;
  km: number;
  kind: EdgeKind;
  geometry: LatLng[];
  road: LatLng[];
  access: LatLng[][];
}
export type Graph = Record<string, { to: string; w: number; kind: EdgeKind }[]>;

export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = Math.PI / 180;
  const s =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1, s)));
}

const coordinate = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
const schema = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        roadAccessible: z.boolean(),
      }),
    )
    .length(48),
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        distanceKm: z.number().positive(),
        geometry: z.array(coordinate).min(2),
        hasAccessConnectors: z.boolean().default(false),
      }),
    )
    .min(46),
});

/** Missing/invalid data never becomes a synthetic graph. */
export function loadGraph(raw: unknown): {
  cities: City[];
  inaccessible: City[];
  edges: GraphEdge[];
  graph: Graph;
} {
  const data = schema.parse(raw);
  const toCity = (n: (typeof data.nodes)[number]): City => ({
    id: n.id,
    name: n.name,
    lat: n.lat,
    lon: n.lng,
  });
  const cities = data.nodes.filter((n) => n.roadAccessible).map(toCity);
  const inaccessible = data.nodes.filter((n) => !n.roadAccessible).map(toCity);
  if (
    cities.length !== 47 ||
    inaccessible.length !== 1 ||
    inaccessible[0]!.name !== "President Carlos P. Garcia"
  )
    throw new Error("Expected 47 road towns and President Carlos P. Garcia separately");
  const byId = new Map(cities.map((n) => [n.id, n]));
  if (
    new Set(data.nodes.map((n) => n.id)).size !== 48 ||
    new Set(data.nodes.map((n) => n.name)).size !== 48
  )
    throw new Error("Duplicate towns");
  const graph: Graph = Object.fromEntries(cities.map((n) => [n.name, []]));
  const pairs = new Set<string>();
  const edges = data.edges.map((e): GraphEdge => {
    const a = byId.get(e.from),
      b = byId.get(e.to);
    const pair = [e.from, e.to].sort().join("|");
    if (!a || !b || a === b || pairs.has(pair)) throw new Error("Invalid or duplicate road");
    pairs.add(pair);
    const first = e.geometry[0]!,
      last = e.geometry.at(-1)!;
    if (first[0] !== a.lat || first[1] !== a.lon || last[0] !== b.lat || last[1] !== b.lon)
      throw new Error("Road endpoints do not match town centers");
    let length = 0;
    for (let i = 1; i < e.geometry.length; i++) {
      const p = e.geometry[i - 1]!,
        q = e.geometry[i]!;
      length += haversineKm({ lat: p[0], lon: p[1] }, { lat: q[0], lon: q[1] });
    }
    if (e.distanceKm + 1e-8 < haversineKm(a, b) || Math.abs(length - e.distanceKm) > 0.001)
      throw new Error("Invalid road distance");
    graph[a.name]!.push({ to: b.name, w: e.distanceKm, kind: "road" });
    graph[b.name]!.push({ to: a.name, w: e.distanceKm, kind: "road" });
    if (e.hasAccessConnectors && e.geometry.length < 4)
      throw new Error("Missing road between access connectors");
    return {
      a: a.name,
      b: b.name,
      km: e.distanceKm,
      kind: "road",
      geometry: e.geometry,
      road: e.hasAccessConnectors ? e.geometry.slice(1, -1) : e.geometry,
      access: e.hasAccessConnectors ? [e.geometry.slice(0, 2), e.geometry.slice(-2)] : [],
    };
  });
  const seen = new Set<string>(),
    pending = [cities[0]!.name];
  while (pending.length) {
    const name = pending.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    pending.push(...graph[name]!.map((e) => e.to));
  }
  if (seen.size !== 47)
    throw new Error(
      `Disconnected towns: ${cities
        .filter((c) => !seen.has(c.name))
        .map((c) => c.name)
        .join(", ")}`,
    );
  return { cities, inaccessible, edges, graph };
}
