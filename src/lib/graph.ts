export type IslandGroup = "luzon" | "visayas" | "mindanao";

export interface City {
  name: string;
  lat: number;
  lon: number;
  /** Island group — used for edge classification and for grouping UI pickers. */
  group: IslandGroup;
}

/**
 * Nationwide dataset: 50 cities / provincial capitals across all three
 * island groups. (Puerto Princesa and Calapan sit in MIMAROPA, which is
 * conventionally attached to the Luzon island group.)
 */
export const CITIES: City[] = [
  // ---- Luzon ----
  { name: "Manila", lat: 14.5995, lon: 120.9842, group: "luzon" },
  { name: "QuezonCity", lat: 14.676, lon: 121.0437, group: "luzon" },
  { name: "Angeles", lat: 15.1449, lon: 120.5887, group: "luzon" },
  { name: "Baguio", lat: 16.4023, lon: 120.596, group: "luzon" },
  { name: "Tarlac", lat: 15.4802, lon: 120.5979, group: "luzon" },
  { name: "Cabanatuan", lat: 15.4869, lon: 120.9683, group: "luzon" },
  { name: "Lucena", lat: 13.9373, lon: 121.6174, group: "luzon" },
  { name: "Batangas", lat: 13.7565, lon: 121.0583, group: "luzon" },
  { name: "Naga", lat: 13.6218, lon: 123.1948, group: "luzon" },
  { name: "Legazpi", lat: 13.1391, lon: 123.7438, group: "luzon" },
  { name: "Vigan", lat: 17.5747, lon: 120.3869, group: "luzon" },
  { name: "Laoag", lat: 18.196, lon: 120.5936, group: "luzon" },
  { name: "Tuguegarao", lat: 17.6132, lon: 121.727, group: "luzon" },
  { name: "Dagupan", lat: 16.043, lon: 120.334, group: "luzon" },
  { name: "SanFernandoLU", lat: 16.6159, lon: 120.3209, group: "luzon" },
  { name: "SanFernandoPampanga", lat: 15.0286, lon: 120.6897, group: "luzon" },
  { name: "Olongapo", lat: 14.8294, lon: 120.2827, group: "luzon" },
  { name: "CaviteCity", lat: 14.4791, lon: 120.897, group: "luzon" },
  { name: "Lipa", lat: 13.9411, lon: 121.1622, group: "luzon" },
  { name: "SanPablo", lat: 14.0683, lon: 121.3251, group: "luzon" },
  { name: "PuertoPrincesa", lat: 9.7392, lon: 118.7353, group: "luzon" },
  { name: "Calapan", lat: 13.4115, lon: 121.1803, group: "luzon" },
  { name: "SorsogonCity", lat: 12.9743, lon: 124.0058, group: "luzon" },
  // ---- Visayas ----
  { name: "CebuCity", lat: 10.3157, lon: 123.8854, group: "visayas" },
  { name: "Mandaue", lat: 10.3237, lon: 123.9227, group: "visayas" },
  { name: "LapuLapu", lat: 10.3103, lon: 123.9494, group: "visayas" },
  { name: "Tagbilaran", lat: 9.6474, lon: 123.8536, group: "visayas" },
  { name: "Dumaguete", lat: 9.3068, lon: 123.3054, group: "visayas" },
  { name: "Bacolod", lat: 10.6713, lon: 122.9511, group: "visayas" },
  { name: "IloiloCity", lat: 10.7202, lon: 122.5621, group: "visayas" },
  { name: "RoxasCity", lat: 11.5853, lon: 122.7511, group: "visayas" },
  { name: "Kalibo", lat: 11.7079, lon: 122.3647, group: "visayas" },
  { name: "Tacloban", lat: 11.2543, lon: 125.0, group: "visayas" },
  { name: "Ormoc", lat: 11.0064, lon: 124.6075, group: "visayas" },
  { name: "Calbayog", lat: 12.0678, lon: 124.5953, group: "visayas" },
  { name: "Catbalogan", lat: 11.7753, lon: 124.8859, group: "visayas" },
  { name: "Borongan", lat: 11.6086, lon: 125.4306, group: "visayas" },
  // ---- Mindanao ----
  { name: "ZamboangaCity", lat: 6.9214, lon: 122.079, group: "mindanao" },
  { name: "Dipolog", lat: 8.5886, lon: 123.3417, group: "mindanao" },
  { name: "Pagadian", lat: 7.8257, lon: 123.437, group: "mindanao" },
  { name: "CagayanDeOro", lat: 8.4542, lon: 124.6319, group: "mindanao" },
  { name: "Iligan", lat: 8.228, lon: 124.2452, group: "mindanao" },
  { name: "Marawi", lat: 7.9986, lon: 124.2928, group: "mindanao" },
  { name: "Butuan", lat: 8.9475, lon: 125.5406, group: "mindanao" },
  { name: "SurigaoCity", lat: 9.7897, lon: 125.498, group: "mindanao" },
  { name: "DavaoCity", lat: 7.1907, lon: 125.4553, group: "mindanao" },
  { name: "Tagum", lat: 7.4478, lon: 125.8078, group: "mindanao" },
  { name: "GeneralSantos", lat: 6.1164, lon: 125.1716, group: "mindanao" },
  { name: "Koronadal", lat: 6.5008, lon: 124.8467, group: "mindanao" },
  { name: "CotabatoCity", lat: 7.2231, lon: 124.2452, group: "mindanao" },
];

export const cityByName = new Map(CITIES.map((c) => [c.name, c]));

/** Great-circle distance in km between two lat/lon points. */
export function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371; // Earth radius, km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * "road" = plausibly driveable: same island group and short. Anything else is
 * a "sea" (ferry / flight) leg — cross-water links are real connections in the
 * graph, but the UI calls them out so the visualization never implies a paved
 * road across the ocean.
 */
export type EdgeKind = "road" | "sea";

export interface GraphEdge {
  a: string;
  b: string;
  km: number;
  kind: EdgeKind;
}

/** Each city is linked to its K nearest neighbors by haversine distance. */
export const K_NEAREST = 5;
/** Same-group edges under this length count as roads; longer ones are sea/air. */
export const ROAD_MAX_KM = 150;

function classify(a: City, b: City, km: number): EdgeKind {
  return a.group === b.group && km < ROAD_MAX_KM ? "road" : "sea";
}

/**
 * Why not hand-list every road? With 50 cities a hand-typed road list would be
 * long, error-prone, and silently incomplete. Instead we GENERATE the graph:
 *
 *  1. k-nearest-neighbors: each city gets an edge to its K closest cities.
 *     k-NN alone clusters within islands — nothing connects Luzon to the
 *     Visayas, because every Luzon city's nearest neighbors are all in Luzon.
 *  2. Connectivity guarantee: union-find finds the disconnected components,
 *     then we repeatedly add the single minimum-distance edge between two
 *     different components until one component remains. This adds exactly the
 *     cheapest "bridge" crossings, and guarantees every route query between
 *     any two cities — even Luzon-to-Mindanao — has an answer.
 */
function buildEdges(): GraphEdge[] {
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const edges = new Map<string, GraphEdge>();

  // Step 1: k-NN edges (symmetrized — either endpoint may nominate the pair).
  for (const c of CITIES) {
    const nearest = CITIES.filter((o) => o.name !== c.name)
      .map((o) => ({ o, km: haversineKm(c, o) }))
      .sort((x, y) => x.km - y.km)
      .slice(0, K_NEAREST);
    for (const { o, km } of nearest) {
      const key = edgeKey(c.name, o.name);
      if (!edges.has(key)) {
        edges.set(key, { a: c.name, b: o.name, km, kind: classify(c, o, km) });
      }
    }
  }

  // Step 2: union-find over the k-NN edges, then bridge components.
  const parent = new Map(CITIES.map((c) => [c.name, c.name]));
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // path compression
    let cur = x;
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  for (const e of edges.values()) union(e.a, e.b);

  for (;;) {
    // Closest pair of cities still in DIFFERENT components.
    let best: { a: City; b: City; km: number } | null = null;
    for (let i = 0; i < CITIES.length; i++) {
      for (let j = i + 1; j < CITIES.length; j++) {
        const a = CITIES[i]!;
        const b = CITIES[j]!;
        if (find(a.name) === find(b.name)) continue;
        const km = haversineKm(a, b);
        if (!best || km < best.km) best = { a, b, km };
      }
    }
    if (!best) break; // one component — the graph is fully connected
    const key = edgeKey(best.a.name, best.b.name);
    edges.set(key, {
      a: best.a.name,
      b: best.b.name,
      km: best.km,
      kind: classify(best.a, best.b, best.km),
    });
    union(best.a.name, best.b.name);
  }

  return [...edges.values()];
}

/** All generated edges (k-NN + connectivity bridges), weights in haversine km. */
export const EDGES: GraphEdge[] = buildEdges();

export type Graph = Record<string, { to: string; w: number; kind: EdgeKind }[]>;

/** Weighted adjacency list built from the generated edges. */
export const GRAPH: Graph = (() => {
  const g: Graph = {};
  for (const c of CITIES) g[c.name] = [];
  for (const { a, b, km, kind } of EDGES) {
    g[a]!.push({ to: b, w: km, kind });
    g[b]!.push({ to: a, w: km, kind });
  }
  return g;
})();
