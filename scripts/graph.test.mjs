import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import ts from "typescript";
import { haversineKm, loadGraph } from "../src/lib/graph-data.ts";

// Synthetic coordinates are test fixtures only, never exported as geographic data.
function fixture() {
  const nodes = Array.from({ length: 47 }, (_, i) => ({
    id: String(i),
    name: `Town ${i}`,
    lat: 10 + (i % 7) * 0.03,
    lng: 123 + Math.floor(i / 7) * 0.04,
    roadAccessible: true,
  }));
  nodes.push({
    id: "island",
    name: "President Carlos P. Garcia",
    lat: 11,
    lng: 125,
    roadAccessible: false,
  });
  const edge = (a, b) => ({
    from: a.id,
    to: b.id,
    distanceKm: haversineKm({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng }),
    geometry: [
      [a.lat, a.lng],
      [b.lat, b.lng],
    ],
  });
  return {
    nodes,
    edges: [...nodes.slice(1, 47).map((n, i) => edge(nodes[i], n)), edge(nodes[0], nodes[46])],
  };
}

test("47 road towns are connected; island center is display-only", () => {
  const data = loadGraph(fixture());
  assert.equal(data.cities.length, 47);
  assert.equal(data.inaccessible[0].name, "President Carlos P. Garcia");
  assert.equal(data.graph["President Carlos P. Garcia"], undefined);
});

test("reject duplicate, disconnected, shorter-than-straight, and misaligned roads", () => {
  let data = fixture();
  data.edges.push(data.edges[0]);
  assert.throws(() => loadGraph(data), /duplicate road/i);
  data = fixture();
  data.edges = data.edges.filter((e) => e.from !== "5" && e.to !== "5");
  // Keep the minimum edge count while isolating Town 5.
  const a = data.nodes[1],
    b = data.nodes[3];
  data.edges.push({
    from: a.id,
    to: b.id,
    geometry: [
      [a.lat, a.lng],
      [b.lat, b.lng],
    ],
    distanceKm: haversineKm({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng }),
  });
  assert.throws(() => loadGraph(data), /Disconnected towns/);
  data = fixture();
  data.edges[0].distanceKm /= 2;
  assert.throws(() => loadGraph(data), /Invalid road distance/);
  data = fixture();
  data.edges[0].geometry[0][0] += 0.001;
  assert.throws(() => loadGraph(data), /endpoints/);
});

function algorithms(data) {
  const module = { exports: {} };
  const code = ts.transpileModule(
    readFileSync(new URL("../src/lib/pathfinding.ts", import.meta.url), "utf8"),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  const graph = {
    GRAPH: data.graph,
    CITIES: data.cities,
    cityByName: new Map(data.cities.map((c) => [c.name, c])),
    haversineKm,
  };
  new Function("require", "module", "exports", code)(
    (id) => {
      assert.equal(id, "./graph");
      return graph;
    },
    module,
    module.exports,
  );
  return module.exports;
}

function checkAlgorithms(data) {
  const { runAlgorithm } = algorithms(data);
  // Every edge must preserve heuristic consistency for every goal.
  for (const goal of data.cities)
    for (const edge of data.edges) {
      const a = data.cities.find((c) => c.name === edge.a),
        b = data.cities.find((c) => c.name === edge.b);
      assert.ok(haversineKm(a, goal) <= edge.km + haversineKm(b, goal) + 1e-8);
    }
  for (const [i, j] of [
    [0, 46],
    [13, 22],
    [25, 2],
    [5, 5],
  ]) {
    const from = data.cities[i].name,
      to = data.cities[j].name;
    const expected = runAlgorithm("dijkstra", from, to).distanceKm;
    for (const algo of ["dijkstra", "astar", "floyd", "greedy"]) {
      const result = runAlgorithm(algo, from, to);
      assert.equal(result.path[0], from);
      assert.equal(result.path.at(-1), to);
      for (let k = 1; k < result.path.length; k++)
        assert.ok(data.graph[result.path[k - 1]].some((e) => e.to === result.path[k]));
      if (algo !== "greedy") assert.ok(Math.abs(result.distanceKm - expected) < 1e-8);
    }
  }
  assert.throws(() => runAlgorithm("floyd", "absent", "absent"), /Select two towns/);
}

test("A*, Dijkstra and Floyd agree; every algorithm follows graph edges", () =>
  checkAlgorithms(loadGraph(fixture())));
const realFile = new URL("../src/data/bohol-graph.json", import.meta.url);
test("generated Bohol data validates and pathfinding agrees", { skip: !existsSync(realFile) }, () =>
  checkAlgorithms(loadGraph(JSON.parse(readFileSync(realFile, "utf8")))),
);
