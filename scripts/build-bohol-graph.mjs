import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import osmtogeojson from "osmtogeojson";
import { loadGraph } from "../src/lib/graph-data.ts";
import {
  booleanPointInPolygon,
  booleanIntersects,
  distance,
  featureCollection,
  length,
  lineString,
  point,
  simplify,
} from "@turf/turf";

const root = fileURLToPath(new URL("../", import.meta.url));
const cache = path.join(root, ".cache", "bohol-data");
const output = path.join(root, "public", "data");
const userAgent = "pathfinding-cipher/1.0 (educational offline Bohol road graph builder)";
const overpass = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const router = process.env.OSRM_URL || "https://router.project-osrm.org";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const warnings = [];
const rejected = [];
await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });
await mkdir(path.join(root, "src", "data"), { recursive: true });

/** Cache successful raw responses only; serial requests stay below one per second. */
async function download(url, json = true) {
  const file = path.join(
    cache,
    createHash("sha256").update(url).digest("hex") + (json ? ".json" : ".txt"),
  );
  try {
    const text = await readFile(file, "utf8");
    return json ? JSON.parse(text) : text;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    await delay(attempt ? 3000 * 2 ** attempt : 1100);
    console.log(`Download ${new URL(url).hostname} (attempt ${attempt + 1})`);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": userAgent },
        signal: AbortSignal.timeout(180000),
      });
      if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 220)}`);
      const text = await response.text();
      const value = json ? JSON.parse(text) : text;
      if (value.remark) throw new Error(value.remark);
      await writeFile(file, text);
      return value;
    } catch (error) {
      console.warn(error.message);
      if (attempt === 2) throw new Error(`Could not download ${url}: ${error.message}`);
    }
  }
}

async function buildProvinces() {
  const repo = "faeldon/philippines-json-maps";
  const tree = await download(`https://api.github.com/repos/${repo}/git/trees/master?recursive=1`);
  const files = tree.tree.filter((entry) =>
    /^2023\/geojson\/regions\/lowres\/provdists-region-.*\.json$/.test(entry.path),
  );
  if (!files.length)
    throw new Error("Province source layout changed; no region province files found");
  const features = new Map();
  for (const file of files) {
    const collection = await download(
      `https://raw.githubusercontent.com/${repo}/${tree.sha}/${file.path}`,
    );
    for (const feature of collection.features) {
      const props = feature.properties;
      const name = props.ADM2_EN || props.adm2_en || props.PROVINCE || props.name;
      if (!name && props.geo_level === null) {
        warnings.push(`Skipped unassigned boundary ${props.adm2_psgc}`);
        continue;
      }
      if (!name) throw new Error(`Unknown province properties: ${JSON.stringify(props)}`);
      const id = String(props.ADM2_PCODE || props.adm2_psgc || name);
      const reduced = simplify(feature, { tolerance: 0.005, highQuality: true });
      reduced.properties = { id, name, datasetId: name.toLowerCase() === "bohol" ? "bohol" : null };
      features.set(id, reduced);
    }
  }
  const provinces = featureCollection([...features.values()]);
  if (!provinces.features.some((f) => f.properties.datasetId === "bohol"))
    throw new Error("Province source has no Bohol feature");
  await writeFile(path.join(output, "ph-provinces.geo.json"), JSON.stringify(provinces));
  const license = await download(
    `https://raw.githubusercontent.com/${repo}/${tree.sha}/LICENSE`,
    false,
  );
  await writeFile(path.join(output, "province-source-LICENSE.txt"), license);
  console.log(
    `Province outlines: ${features.size}, ${Math.round(JSON.stringify(provinces).length / 1024)} KiB`,
  );
  return {
    repository: `https://github.com/${repo}`,
    commit: tree.sha,
    files: files.map((f) => f.path),
  };
}

const normalize = (name = "") =>
  name
    .toLowerCase()
    .replace(/city of |municipality of | city$/g, "")
    .replace(/[^a-z0-9]/g, "");
const lngLat = (node) => [node.lng, node.lat];
const inside = (coordinates, polygon) => booleanPointInPolygon(point(coordinates), polygon);

async function buildRoads(provinceSource) {
  // PH uses level 6 for municipalities/cities; level 8 is queried for compatibility,
  // but accepted only when explicitly tagged as a municipality/city.
  const query = `[out:json][timeout:150];area["name"="Bohol"]["admin_level"="4"]->.bohol;
    (rel(area.bohol)["boundary"="administrative"]["admin_level"~"^(6|8)$"];
     way(area.bohol)["boundary"="administrative"]["admin_level"~"^(6|8)$"];
     node(area.bohol)["place"~"^(town|city)$"];
     way(area.bohol)["highway"]["bridge"]["bridge"!="no"];);
    (._;>;);out body;`;
  const osm = await download(`${overpass}?data=${encodeURIComponent(query)}`);
  const polygons = osmtogeojson(osm, { flatProperties: true }).features;
  const relations = osm.elements.filter(
    (e) =>
      (e.type === "relation" || e.type === "way") &&
      e.tags?.name &&
      polygons.some(
        (f) =>
          f.id === `${e.type}/${e.id}` && ["Polygon", "MultiPolygon"].includes(f.geometry.type),
      ) &&
      (e.tags?.admin_level === "6" ||
        /^(municipality|city)$/.test(e.tags?.["admin_type:PH"] || "")),
  );
  let boundaries = relations.map((relation) => ({
    name: relation.tags.name,
    polygon: polygons.find((f) => f.id === `${relation.type}/${relation.id}`),
    adminCenter: relation.members?.find((m) => m.type === "node" && m.role === "admin_centre")?.ref,
    ways: new Set(
      relation.members?.filter((m) => m.type === "way").map((m) => m.ref) ?? [relation.id],
    ),
    boundarySource: `osm-${relation.type}-${relation.id}`,
  }));
  if (boundaries.length !== 48) {
    const sourcePath = "2023/geojson/provdists/hires/municities-provdist-701200000.0.1.json";
    const url = `https://raw.githubusercontent.com/faeldon/philippines-json-maps/${provinceSource.commit}/${sourcePath}`;
    const fallback = await download(url);
    warnings.push(
      `OSM provided ${boundaries.length}/48 municipal polygons; using the complete PSGC municipal topology from ${url}. Centers remain OSM place nodes.`,
    );
    provinceSource.municipalBoundaries = sourcePath;
    boundaries = fallback.features.map((polygon) => {
      const name = polygon.properties.adm3_en || polygon.properties.ADM3_EN;
      if (!name) throw new Error(`Unknown municipal fields: ${JSON.stringify(polygon.properties)}`);
      return { name, polygon, ways: new Set(), boundarySource: url };
    });
  }
  if (boundaries.length !== 48)
    throw new Error(`Expected 48 municipal boundaries, found ${boundaries.length}`);
  const places = osm.elements.filter(
    (e) => e.type === "node" && /^(town|city)$/.test(e.tags?.place || ""),
  );
  const nodesById = new Map(osm.elements.filter((e) => e.type === "node").map((e) => [e.id, e]));
  const towns = boundaries
    .map((boundary) => {
      const polygon = boundary.polygon;
      if (
        !polygon ||
        !["Polygon", "MultiPolygon"].includes(polygon.geometry.type) ||
        polygon.properties.tainted
      )
        throw new Error(`Incomplete boundary: ${boundary.name}`);
      let center = nodesById.get(boundary.adminCenter);
      if (!center || !/^(town|city)$/.test(center.tags?.place || "")) {
        const matches = places.filter(
          (p) =>
            (normalize(p.tags.name) === normalize(boundary.name) ||
              normalize(p.tags.alt_name) === normalize(boundary.name)) &&
            inside([p.lon, p.lat], polygon),
        );
        if (matches.length !== 1)
          throw new Error(
            `Ambiguous/missing town center for ${boundary.name}; fix OSM or inspect cached response`,
          );
        center = matches[0];
      }
      if (!inside([center.lon, center.lat], polygon))
        throw new Error(`Town center outside boundary: ${boundary.name}`);
      return {
        id: `osm-node-${center.id}`,
        name: boundary.name,
        lat: center.lat,
        lng: center.lon,
        osmNodeId: center.id,
        roadAccessible: normalize(boundary.name) !== "presidentcarlospgarcia",
        polygon,
        bridgePolygon:
          polygons.find(
            (f) =>
              ["Polygon", "MultiPolygon"].includes(f.geometry.type) &&
              normalize(f.properties.name) === normalize(boundary.name),
          ) ?? polygon,
        ways: boundary.ways,
        boundarySource: boundary.boundarySource,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  if (
    !towns.some((t) => normalize(t.name) === "tagbilaran") ||
    !towns.some((t) => normalize(t.name) === "panglao")
  )
    throw new Error("Tagbilaran or Panglao missing");

  // Bridge endpoints supplement touching boundaries when administrative polygons stop
  // at the coastline. Only OSM-mapped road bridges can introduce these extra pairs.
  const bridges = osm.elements
    .filter((e) => e.type === "way" && e.tags?.highway && e.tags?.bridge && e.tags.bridge !== "no")
    .map((w) => ({ id: w.id, ends: [nodesById.get(w.nodes[0]), nodesById.get(w.nodes.at(-1))] }))
    .filter((bridge) => bridge.ends.every(Boolean));
  const candidates = [];
  for (let i = 0; i < towns.length; i++)
    for (let j = i + 1; j < towns.length; j++) {
      const a = towns[i],
        b = towns[j];
      if (!a.roadAccessible || !b.roadAccessible) continue;
      const adjacent =
        [...a.ways].some((w) => b.ways.has(w)) || booleanIntersects(a.polygon, b.polygon);
      const bridged = bridges.find(
        ({ ends: [p, q] }) =>
          (inside([p.lon, p.lat], a.bridgePolygon) && inside([q.lon, q.lat], b.bridgePolygon)) ||
          (inside([q.lon, q.lat], a.bridgePolygon) && inside([p.lon, p.lat], b.bridgePolygon)),
      );
      if (adjacent || bridged) candidates.push([a, b, bridged?.id]);
    }
  console.log(`${towns.length} town centers; ${candidates.length} neighboring/bridge pairs`);
  const edges = [];
  for (const [a, b, bridgeId] of candidates) {
    console.log(`Route ${a.name} — ${b.name}`);
    const coords = `${a.lng},${a.lat};${b.lng},${b.lat}`;
    const response = await download(
      `${router}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=true`,
    );
    if (response.code !== "Ok") {
      if (["NoRoute", "NoSegment"].includes(response.code)) {
        rejected.push({ towns: [a.name, b.name], reason: response.code });
        continue;
      }
      throw new Error(`OSRM ${response.code}: ${response.message || "request failed"}`);
    }
    const snaps = response.waypoints.map((w) => w.distance);
    // User-approved approximate center access, explicitly dashed in the UI.
    // Reject anything beyond a short town-center access leg.
    if (snaps.some((meters) => meters > 150)) {
      rejected.push({
        towns: [a.name, b.name],
        reason: `Town-center road snap exceeds 150 m: ${snaps.join(", ")}`,
      });
      continue;
    }
    let chosen;
    for (const route of response.routes) {
      if (route.legs.some((leg) => leg.steps.some((s) => s.mode === "ferry"))) continue;
      const coords = route.geometry.coordinates;
      const thirdTownKm = new Map();
      // Densify every road segment to <=50 m before territory classification.
      // Ignore only <=100 m total in another territory (boundary/rounding slivers).
      for (let i = 1; i < coords.length; i++) {
        const p = coords[i - 1],
          q = coords[i],
          km = distance(p, q),
          count = Math.max(1, Math.ceil(km / 0.05));
        for (let k = 0; k < count; k++) {
          const t = (k + 0.5) / count,
            mid = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
          if (inside(mid, a.polygon) || inside(mid, b.polygon)) continue;
          const third = towns.find((town) => town !== a && town !== b && inside(mid, town.polygon));
          if (third) thirdTownKm.set(third.name, (thirdTownKm.get(third.name) || 0) + km / count);
        }
      }
      const crossings = [...thirdTownKm].filter(([, km]) => km > 0.1);
      if (!crossings.length) {
        chosen = route;
        break;
      }
    }
    if (!chosen) {
      rejected.push({
        towns: [a.name, b.name],
        reason: "Routes cross a third municipality or use a ferry",
      });
      continue;
    }
    // Keep center coordinates exact; record the short road-access discrepancy.
    const original = chosen.geometry.coordinates.map((p) => [...p]);
    const fullLength = length(lineString(original));
    let tolerance = 0.00002; // ~2 m, reduced if distance loss exceeds 0.1%.
    let geometry = simplify(lineString(original), { tolerance, highQuality: true }).geometry
      .coordinates;
    while (length(lineString(geometry)) < fullLength * 0.999 && tolerance > 0.0000001) {
      tolerance /= 2;
      geometry = simplify(lineString(original), { tolerance, highQuality: true }).geometry
        .coordinates;
    }
    // Keep access segments separate from the unchanged snapped road endpoints.
    geometry = [lngLat(a), ...geometry, lngLat(b)];
    // Same sphere as the runtime haversine: Turf uses 6371.0088 km.
    const distanceKm = (length(lineString(geometry)) * 6371) / 6371.0088;
    if (distanceKm + 1e-8 < (distance(lngLat(a), lngLat(b)) * 6371) / 6371.0088)
      throw new Error(`Invalid length: ${a.name} — ${b.name}`);
    if (Math.max(...snaps) > 1)
      warnings.push(
        `${a.name} — ${b.name}: approximate center access ${snaps.map((s) => s.toFixed(1)).join(" / ")} m`,
      );
    if (distanceKm > distance(lngLat(a), lngLat(b)) * 3)
      warnings.push(`${a.name} — ${b.name}: road detour exceeds 3× straight-line distance`);
    edges.push({
      from: a.id,
      to: b.id,
      distanceKm,
      geometry: geometry.map(([lng, lat]) => [lat, lng]),
      osrmDistanceKm: chosen.distance / 1000,
      endpointSnapMeters: snaps,
      hasAccessConnectors: true,
      ...(bridgeId ? { osmBridgeWayId: bridgeId } : {}),
    });
  }
  const roadTowns = towns.filter((t) => t.roadAccessible);
  const groups = [],
    remaining = new Set(roadTowns.map((t) => t.id));
  while (remaining.size) {
    const stack = [remaining.values().next().value],
      group = [];
    while (stack.length) {
      const id = stack.pop();
      if (!remaining.delete(id)) continue;
      group.push(towns.find((t) => t.id === id).name);
      for (const edge of edges)
        if (edge.from === id) stack.push(edge.to);
        else if (edge.to === id) stack.push(edge.from);
    }
    groups.push(group);
  }
  const report = {
    nodes: roadTowns.length,
    totalTownCenters: towns.length,
    inaccessible: towns.filter((t) => !t.roadAccessible).map((t) => t.name),
    edges: edges.length,
    averageDegree: (edges.length * 2) / roadTowns.length,
    components: groups,
    warnings,
    rejected,
  };
  await writeFile(path.join(output, "bohol-build-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (groups.length !== 1)
    throw new Error(
      `Disconnected graph. Components: ${groups.map((g) => g.join(", ")).join(" | ")}. Inspect bohol-build-report.json; no synthetic connections or invalid graph published.`,
    );
  const data = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sources: { osm: "https://www.openstreetmap.org/copyright", overpass, router, provinceSource },
    nodes: towns.map(({ polygon, bridgePolygon, ways, ...town }) => town),
    edges,
    summary: report,
  };
  loadGraph(data);
  await writeFile(path.join(root, "src", "data", "bohol-graph.json"), JSON.stringify(data));
  const readmePath = path.join(root, "README.md");
  const readme = await readFile(readmePath, "utf8");
  await writeFile(
    readmePath,
    readme.replace(
      /<!-- graph-counts:start -->[\s\S]*?<!-- graph-counts:end -->/,
      `<!-- graph-counts:start -->\nValidated graph: V = ${roadTowns.length}, E = ${edges.length} undirected roads (${edges.length * 2} adjacency entries). All ${towns.length} town centers are shown; President Carlos P. Garcia is road-inaccessible.\n<!-- graph-counts:end -->`,
    ),
  );
  console.log("Published validated Bohol graph. Restart Vite or rebuild to load it.");
}

try {
  const source = await buildProvinces();
  if (!process.argv.includes("--provinces-only")) await buildRoads(source);
} catch (error) {
  console.error(
    `Data generation stopped: ${error.message}\nSuccessful downloads remain in .cache/bohol-data. Rerun npm run build:data on a machine with access to the source servers.`,
  );
  process.exitCode = 1;
}
