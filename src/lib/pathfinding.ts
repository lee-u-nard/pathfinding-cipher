import { GRAPH, cityByName, haversineKm, CITIES, type EdgeKind } from "./graph";

export type AlgoName = "astar" | "dijkstra" | "greedy" | "floyd";

export const ALGO_LABELS: Record<AlgoName, string> = {
  astar: "A* Search",
  dijkstra: "Dijkstra",
  greedy: "Greedy Best-First",
  floyd: "Floyd-Warshall",
};

export interface Expansion {
  node: string;
  /** Best known distance from start at the moment of expansion. */
  gKm: number;
  note?: string;
  /**
   * Edge this node was reached through (absent for the start node and for
   * Floyd-Warshall passes). `kind` lets the UI call out sea/air crossings.
   */
  via?: { from: string; kind: EdgeKind; km: number };
}

export interface PathResult {
  path: string[];
  distanceKm: number;
  expanded: Expansion[];
  timeMs: number;
  /** Whether the algorithm guarantees the shortest path. */
  optimal: boolean;
}

function heuristic(node: string, goal: string): number {
  return haversineKm(cityByName.get(node)!, cityByName.get(goal)!);
}

function reconstruct(cameFrom: Map<string, string>, goal: string): string[] {
  const path = [goal];
  let cur = goal;
  while (cameFrom.has(cur)) {
    cur = cameFrom.get(cur)!;
    path.unshift(cur);
  }
  return path;
}

function pathDistance(path: string[]): number {
  let d = 0;
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1]!;
    const to = path[i]!;
    d += (GRAPH[from] ?? []).find((e) => e.to === to)?.w ?? 0;
  }
  return d;
}

/** Shared best-first search. mode: "dijkstra" uses g, "astar" g+h, "greedy" h only. */
function bestFirst(
  start: string,
  goal: string,
  mode: "dijkstra" | "astar" | "greedy",
): PathResult {
  const t0 = performance.now();
  const gScore = new Map<string, number>([[start, 0]]);
  const cameFrom = new Map<string, string>();
  const closed = new Set<string>();
  const expanded: Expansion[] = [];
  // Simple open list (10 nodes — a sorted array is plenty).
  const open: { node: string; f: number }[] = [{ node: start, f: 0 }];

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const { node } = open.shift()!;
    if (closed.has(node)) continue;
    closed.add(node);
    const g = gScore.get(node)!;
    const prev = cameFrom.get(node);
    const viaEdge = prev ? (GRAPH[prev] ?? []).find((e) => e.to === node) : undefined;
    expanded.push({
      node,
      gKm: g,
      ...(prev && viaEdge ? { via: { from: prev, kind: viaEdge.kind, km: viaEdge.w } } : {}),
    });
    if (node === goal) break;

    for (const { to, w } of (GRAPH[node] ?? [])) {
      if (closed.has(to)) continue;
      const tentative = g + w;
      if (tentative < (gScore.get(to) ?? Infinity)) {
        gScore.set(to, tentative);
        cameFrom.set(to, node);
        const h = heuristic(to, goal);
        const f = mode === "dijkstra" ? tentative : mode === "astar" ? tentative + h : h;
        open.push({ node: to, f });
      }
    }
  }

  const path = reconstruct(cameFrom, goal);
  const found = path.length > 1 || start === goal;
  return {
    path: found ? path : [start],
    distanceKm: found ? pathDistance(found ? path : [start]) : 0,
    expanded,
    timeMs: performance.now() - t0,
    optimal: mode !== "greedy",
  };
}

function floydWarshall(start: string, goal: string): PathResult {
  const t0 = performance.now();
  const nodes = CITIES.map((c) => c.name);
  const dist = new Map<string, Map<string, number>>();
  const next = new Map<string, Map<string, string>>();

  for (const i of nodes) {
    dist.set(i, new Map());
    next.set(i, new Map());
    for (const j of nodes) {
      dist.get(i)!.set(j, i === j ? 0 : Infinity);
    }
  }
  for (const u of nodes) {
    for (const { to, w } of (GRAPH[u] ?? [])) {
      dist.get(u)!.set(to, w);
      next.get(u)!.set(to, to);
    }
  }

  // One expansion entry per intermediate-node pass (the outer k loop).
  const expanded: Expansion[] = [];
  for (const k of nodes) {
    let improved = 0;
    for (const i of nodes) {
      for (const j of nodes) {
        const through = dist.get(i)!.get(k)! + dist.get(k)!.get(j)!;
        if (through < dist.get(i)!.get(j)!) {
          dist.get(i)!.set(j, through);
          next.get(i)!.set(j, next.get(i)!.get(k)!);
          improved++;
        }
      }
    }
    expanded.push({
      node: k,
      gKm: dist.get(start)!.get(goal)!,
      note: `pass via ${k}: ${improved} pair${improved === 1 ? "" : "s"} improved`,
    });
  }

  // Reconstruct path via the next-hop matrix.
  const path: string[] = [start];
  if (next.get(start)!.get(goal)) {
    let cur = start;
    while (cur !== goal) {
      cur = next.get(cur)!.get(goal)!;
      path.push(cur);
    }
  }

  return {
    path,
    distanceKm: dist.get(start)!.get(goal)!,
    expanded,
    timeMs: performance.now() - t0,
    optimal: true,
  };
}

export function runAlgorithm(algo: AlgoName, start: string, goal: string): PathResult {
  switch (algo) {
    case "dijkstra":
      return bestFirst(start, goal, "dijkstra");
    case "astar":
      return bestFirst(start, goal, "astar");
    case "greedy":
      return bestFirst(start, goal, "greedy");
    case "floyd":
      return floydWarshall(start, goal);
  }
}

export function compareAll(start: string, goal: string) {
  return (Object.keys(ALGO_LABELS) as AlgoName[]).map((algo) => ({
    algo,
    label: ALGO_LABELS[algo],
    result: runAlgorithm(algo, start, goal),
  }));
}
