import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Play, FastForward, ShieldCheck, RouteIcon, RotateCcw } from "lucide-react";

import { CITIES } from "@/lib/graph";
import {
  ALGO_LABELS,
  compareAll,
  runAlgorithm,
  type AlgoName,
  type PathResult,
} from "@/lib/pathfinding";
import { METHOD_LABELS, runCrypto, type CryptoMethod, type CryptoRun } from "@/lib/crypto-demo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { bruteForceSearch, kmpSearch } from "@/lib/pattern-matching";
import { decompress, rleDecompress } from "@/lib/compression";
import {
  measureCompressionCandidates,
  optimizeCompression,
  type CompressionCandidate,
} from "@/lib/optimizer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CityCombobox } from "@/components/city-combobox";

// Leaflet is browser-only: load the map chunk after hydration, never during SSR.
const SmartMap = lazy(() => import("@/components/smart-map"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Algorithm & Complexity — Pathfinding & Cryptography Visualizer" },
      {
        name: "description",
        content:
          "Watch A*, Dijkstra, Greedy Best-First and Floyd-Warshall race across a live map of the Philippines while RSA, AES-GCM and SHA-256 run step by step.",
      },
      {
        property: "og:title",
        content: "Algorithm & Complexity — Pathfinding & Cryptography Visualizer",
      },
      {
        property: "og:description",
        content:
          "An interactive visualizer that runs classic pathfinding algorithms on a live map alongside real, step-by-step cryptography.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SmartRoutePage,
});

type Phase = "idle" | "running" | "done";
type Speed = "slow" | "normal" | "fast";
const TICK_MS: Record<Speed, number> = { slow: 700, normal: 320, fast: 110 };

function SmartRoutePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /* ----- controls ----- */
  const [algo, setAlgo] = useState<AlgoName>("astar");
  const [start, setStart] = useState("Manila");
  const [goal, setGoal] = useState("Legazpi");
  const [method, setMethod] = useState<CryptoMethod>("rsa");
  const [message, setMessage] = useState("Meet me in Legazpi at dawn. Bring the maps.");
  const [speed, setSpeed] = useState<Speed>("normal");
  const [pattern, setPattern] = useState("pattern");
  const [sampleError, setSampleError] = useState("");
  const [sampleLoading, setSampleLoading] = useState(false);
  const [speedWeight, setSpeedWeight] = useState(50);
  const [textLab, setTextLab] = useState<{
    text: string;
    candidates: CompressionCandidate[];
    restored: boolean;
  } | null>(null);
  const optimization = useMemo(
    () => textLab && optimizeCompression(textLab.candidates, speedWeight / 100),
    [textLab, speedWeight],
  );
  const liveMatches = useMemo(
    () => ({ kmp: kmpSearch(message, pattern), brute: bruteForceSearch(message, pattern) }),
    [message, pattern],
  );

  /* ----- run state ----- */
  const [phase, setPhase] = useState<Phase>("idle");
  const [pathResult, setPathResult] = useState<PathResult | null>(null);
  const [cryptoRun, setCryptoRun] = useState<CryptoRun | null>(null);
  const [expCount, setExpCount] = useState(0);
  const [stepCount, setStepCount] = useState(0);

  /* ----- decrypt / verify state ----- */
  const [revPhase, setRevPhase] = useState<Phase>("idle");
  const [revSteps, setRevSteps] = useState<string[]>([]);
  const [revShown, setRevShown] = useState(0);
  const [verdict, setVerdict] = useState<{ ok: boolean; text: string; revealed: string } | null>(
    null,
  );

  /* ----- advanced comparison ----- */
  // Timings vary between server and browser renders, so calculate them after hydration.
  const comparison = useMemo(
    () => (mounted ? compareAll(start, goal) : null),
    [mounted, start, goal],
  );

  const expansions = pathResult?.expanded ?? [];
  const encSteps = cryptoRun?.encSteps ?? [];
  const running = phase === "running";
  const expDone = expCount >= expansions.length;
  const cryptoDone = stepCount >= encSteps.length;

  /* ----- one interleaved animation loop: each tick advances BOTH sides ----- */
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setExpCount((c) => Math.min(c + 1, expansions.length));
      setStepCount((c) => Math.min(c + 1, encSteps.length));
    }, TICK_MS[speed]);
    return () => clearInterval(id);
  }, [running, speed, expansions.length, encSteps.length]);

  useEffect(() => {
    if (running && pathResult && cryptoRun && expDone && cryptoDone) setPhase("done");
  }, [running, pathResult, cryptoRun, expDone, cryptoDone]);

  /* ----- reverse animation loop (decrypt / verify) ----- */
  useEffect(() => {
    if (revPhase !== "running") return;
    const id = setInterval(() => {
      setRevShown((c) => Math.min(c + 1, revSteps.length));
    }, TICK_MS[speed]);
    return () => clearInterval(id);
  }, [revPhase, speed, revSteps.length]);

  useEffect(() => {
    if (revPhase === "running" && revShown >= revSteps.length && revSteps.length > 0) {
      setRevPhase("done");
    }
  }, [revPhase, revShown, revSteps.length]);

  const handleRun = useCallback(async () => {
    if (running) return;
    setPhase("running");
    setExpCount(0);
    setStepCount(0);
    setRevPhase("idle");
    setRevSteps([]);
    setRevShown(0);
    setVerdict(null);
    setCryptoRun(null);
    const pr = runAlgorithm(algo, start, goal);
    setPathResult(pr);
    const cr = await runCrypto(method, message);
    setCryptoRun(cr);
  }, [running, algo, start, goal, method, message]);

  const loadSample = useCallback(async () => {
    setSampleLoading(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sample.txt`);
      if (!response.ok) throw new Error("Sample file could not be loaded.");
      setMessage(await response.text());
      setSampleError("");
    } catch {
      setSampleError("Could not load the sample text file. Please try again.");
    } finally {
      setSampleLoading(false);
    }
  }, []);

  const runTextLab = useCallback(() => {
    const candidates = measureCompressionCandidates(message);
    setTextLab({
      text: message,
      candidates,
      restored: candidates.every(
        ({ name, result }) =>
          (name === "Huffman" ? decompress(result.data) : rleDecompress(result.data)) === message,
      ),
    });
  }, [message]);

  const skipToResult = useCallback(() => {
    setExpCount(expansions.length);
    setStepCount(encSteps.length);
  }, [expansions.length, encSteps.length]);

  const handleReverse = useCallback(async () => {
    if (!cryptoRun || revPhase === "running") return;
    setVerdict(null);
    setRevShown(0);
    const res = await cryptoRun.reverse(message);
    setRevSteps(res.steps);
    setRevPhase("running");
    setVerdict({ ok: res.ok, text: res.verdict, revealed: res.revealed });
  }, [cryptoRun, revPhase, message]);

  /* ----- derived view data ----- */
  const leftLog = useMemo(() => {
    if (!pathResult) return ["Pick a start and destination, then press Run."];
    const lines = [
      `${ALGO_LABELS[algo]} — ${start} → ${goal}`,
      ...expansions
        .slice(0, expCount)
        .map((e) =>
          e.note
            ? `Floyd-Warshall ${e.note} — best ${start}→${goal}: ${e.gKm.toFixed(1)} km`
            : e.via?.kind === "sea"
              ? `Crossing to ${e.node} via sea/air route — ${e.via.km.toFixed(1)} km leg (${e.gKm.toFixed(1)} km so far)`
              : `Expanding ${e.node} — ${e.gKm.toFixed(1)} km so far`,
        ),
    ];
    if (phase === "done")
      lines.push(
        `Path found: ${pathResult.path.join(" → ")} (${pathResult.distanceKm.toFixed(1)} km)`,
      );
    return lines;
  }, [pathResult, expCount, phase, algo, start, goal]);

  const rightLog = useMemo(() => {
    if (!cryptoRun) return ["Pick a method, type a message below, then press Run."];
    const lines = [
      `${METHOD_LABELS[method]} — ${message.length} character(s)`,
      ...encSteps.slice(0, stepCount),
      ...revSteps.slice(0, revShown),
    ];
    return lines;
  }, [cryptoRun, method, message, encSteps, stepCount, revSteps, revShown]);

  const expandedNames = useMemo(
    () => expansions.slice(0, expCount).map((e) => e.node),
    [expansions, expCount],
  );
  const currentNode = running && expCount > 0 ? (expandedNames[expCount - 1] ?? null) : null;
  const finalPath = phase === "done" && pathResult ? pathResult.path : null;

  const leftLogRef = useRef<HTMLDivElement>(null);
  const rightLogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    leftLogRef.current?.scrollTo({ top: leftLogRef.current.scrollHeight });
  }, [leftLog]);
  useEffect(() => {
    rightLogRef.current?.scrollTo({ top: rightLogRef.current.scrollHeight });
  }, [rightLog]);

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:grid lg:h-dvh lg:min-h-0 lg:grid-cols-[300px_minmax(0,1fr)_330px] lg:grid-rows-[auto_minmax(0,1fr)] lg:overflow-hidden">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5 lg:col-start-2 lg:row-start-1">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <RouteIcon className="h-4 w-4" />
          </div>
          <h1 className="font-display text-lg font-semibold tracking-tight">
            Algorithm & Complexity
          </h1>
        </div>
        {/*<p className="panel-eyebrow hidden sm:block">client-side algorithms · zero servers</p>*/}
      </header>

      {/* Three-zone layout: pathfinding | map | cryptography */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:col-start-2 lg:row-start-2 lg:h-full lg:overflow-y-auto lg:overscroll-contain">
        {/* CENTER — map (first when stacked) */}
        <section
          aria-label="Interactive map"
          className="order-1 h-[55vh] min-h-[360px] shrink-0 overflow-hidden rounded-xl border border-border lg:h-[55dvh] lg:min-h-[400px]"
        >
          {mounted ? (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center bg-card text-sm text-muted-foreground">
                  Loading map…
                </div>
              }
            >
              <SmartMap
                start={start}
                goal={goal}
                expanded={expandedNames}
                current={currentNode}
                path={finalPath}
              />
            </Suspense>
          ) : (
            <div className="flex h-full items-center justify-center bg-card text-sm text-muted-foreground">
              Loading map…
            </div>
          )}
        </section>

        {/* LEFT — pathfinding */}
        <section
          aria-label="Pathfinding controls"
          className="order-2 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:fixed lg:inset-y-0 lg:left-0 lg:w-[300px] lg:overflow-y-auto lg:overscroll-contain"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Pathfinding</h2>
            <span className="panel-eyebrow text-route">graph · {CITIES.length} cities</span>
          </div>

          <label className="space-y-1.5">
            <span className="panel-eyebrow">Algorithm</span>
            <Select value={algo} onValueChange={(v) => setAlgo(v as AlgoName)} disabled={running}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ALGO_LABELS) as AlgoName[]).map((a) => (
                  <SelectItem key={a} value={a}>
                    {ALGO_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1.5">
              <span className="panel-eyebrow">Start</span>
              <CityCombobox
                aria-label="Start city"
                value={start}
                onChange={setStart}
                disabled={running}
              />
            </label>
            <label className="space-y-1.5">
              <span className="panel-eyebrow">Destination</span>
              <CityCombobox
                aria-label="Destination city"
                value={goal}
                onChange={setGoal}
                disabled={running}
              />
            </label>
          </div>

          <div
            ref={leftLogRef}
            aria-live="polite"
            className="log-pane h-44 min-h-36 flex-1 space-y-1 overflow-y-auto rounded-md border border-border bg-background p-2.5 lg:h-0 lg:min-h-0"
          >
            {leftLog.map((line, i) => (
              <p key={i} className={cn(i === 0 && "text-route", i > 0 && "text-foreground/80")}>
                <span className="mr-1.5 text-muted-foreground">›</span>
                {line}
              </p>
            ))}
            {running && <p className="animate-pulse text-route">▍</p>}
          </div>

          {pathResult && phase === "done" && (
            <div className="grid grid-cols-3 gap-2">
              <MetricCard label="Distance" value={`${pathResult.distanceKm.toFixed(1)} km`} />
              <MetricCard label="Expanded" value={`${pathResult.expanded.length}`} />
              <MetricCard label="Time" value={`${pathResult.timeMs.toFixed(2)} ms`} />
            </div>
          )}
        </section>

        {/* RIGHT — cryptography */}
        <section
          aria-label="Cryptography controls"
          className="order-3 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 lg:fixed lg:inset-y-0 lg:right-0 lg:w-[330px] lg:overflow-y-auto lg:overscroll-contain"
        >
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold">Cryptography</h2>
            <span className="panel-eyebrow text-crypto">web crypto + bigint</span>
          </div>

          <label className="space-y-1.5">
            <span className="panel-eyebrow">Method</span>
            <Select
              value={method}
              onValueChange={(v) => setMethod(v as CryptoMethod)}
              disabled={running}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METHOD_LABELS) as CryptoMethod[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div
            ref={rightLogRef}
            aria-live="polite"
            className="log-pane h-44 min-h-36 flex-1 space-y-1 overflow-y-auto rounded-md border border-border bg-background p-2.5 lg:h-0 lg:min-h-0"
          >
            {rightLog.map((line, i) => (
              <p key={i} className={cn(i === 0 && "text-crypto", i > 0 && "text-foreground/80")}>
                <span className="mr-1.5 text-muted-foreground">›</span>
                <span className="break-all">{line}</span>
              </p>
            ))}
            {(running || revPhase === "running") && <p className="animate-pulse text-crypto">▍</p>}
          </div>

          {cryptoRun && phase === "done" && (
            <div className="space-y-1.5 rounded-md border border-border bg-background p-2.5">
              <p className="panel-eyebrow">Result</p>
              {cryptoRun.artifacts.map((a) => (
                <div key={a.label} className="log-pane">
                  <span className="text-crypto">{a.label}: </span>
                  <span className="break-all text-foreground/80">{a.value}</span>
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                className="mt-2 w-full"
                onClick={handleReverse}
                disabled={revPhase === "running"}
              >
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                {revPhase === "done" ? `${cryptoRun.reverseLabel} again` : cryptoRun.reverseLabel}
              </Button>
            </div>
          )}

          {verdict && revPhase === "done" && (
            <div
              className={cn(
                "space-y-1.5 rounded-md border p-2.5",
                verdict.ok
                  ? "border-crypto/50 bg-crypto/10"
                  : "border-destructive/60 bg-destructive/10",
              )}
            >
              <p
                className={cn(
                  "text-xs font-semibold",
                  verdict.ok ? "text-crypto" : "text-destructive",
                )}
              >
                {verdict.ok ? "✓ Match confirmed" : "✗ Mismatch detected"}
              </p>
              <p className="text-xs text-foreground/80">{verdict.text}</p>
              <p className="log-pane break-all rounded bg-background p-2 text-foreground/90">
                {verdict.revealed}
              </p>
            </div>
          )}
        </section>
        {/* BOTTOM — message + run controls */}
        <footer className="order-4 shrink-0 border-t border-border bg-card">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-3 px-4 py-4">
            <label htmlFor="sr-message" className="panel-eyebrow self-start">
              Message to encrypt
            </label>
            <Textarea
              id="sr-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full resize-none bg-background font-mono text-sm"
              placeholder="Type the secret message…"
              disabled={running || sampleLoading}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={loadSample}
              disabled={running || sampleLoading}
            >
              {sampleLoading ? "Loading sample…" : "Load sample text"}
            </Button>
            {sampleError && (
              <p role="alert" className="text-xs text-destructive">
                {sampleError}
              </p>
            )}

            <Collapsible className="w-full rounded-md border border-border bg-background p-3">
              <CollapsibleTrigger className="flex w-full items-center justify-between text-left text-sm font-semibold">
                Text Lab <ChevronDown className="h-4 w-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3">
                <label htmlFor="text-pattern" className="panel-eyebrow">
                  Pattern to find
                </label>
                <div className="flex gap-2">
                  <Input
                    id="text-pattern"
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                    placeholder="Type a pattern…"
                  />
                  <Button onClick={runTextLab} disabled={running || sampleLoading}>
                    Compress & optimize
                  </Button>
                </div>
                <label htmlFor="speed-weight" className="block text-xs text-muted-foreground">
                  Speed weight: {speedWeight}% · size weight: {100 - speedWeight}%
                </label>
                <input
                  id="speed-weight"
                  type="range"
                  min="0"
                  max="100"
                  value={speedWeight}
                  onChange={(e) => setSpeedWeight(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div aria-live="polite" className="space-y-2 text-sm">
                  <p className="break-words">
                    <strong>Live match positions:</strong>{" "}
                    {liveMatches.kmp.positions.length
                      ? liveMatches.kmp.positions.join(", ")
                      : "None"}
                  </p>
                  <p>
                    KMP comparisons: {liveMatches.kmp.comparisons} · Brute force:{" "}
                    {liveMatches.brute.comparisons}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Searches the current message as you type. Case-sensitive; positions are
                    zero-based UTF-16 offsets. Empty patterns have no matches.
                  </p>
                  {textLab && optimization && (
                    <>
                      {textLab.text !== message && (
                        <p className="text-xs text-muted-foreground">
                          Message changed. Compress & optimize again to refresh these results.
                        </p>
                      )}
                      <p>
                        <strong>Original:</strong> {textLab.candidates[0]!.result.originalSize}{" "}
                        UTF-8 bytes
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Sizes include encoding headers; ratio = compressed / original. All decoders{" "}
                        {textLab.restored ? "reproduced" : "did not reproduce"} the input.
                      </p>
                      <p>
                        <strong>Optimizer choice:</strong> {optimization.choice.name} (
                        {optimization.choice.result.compressedSize} bytes, score{" "}
                        {optimization.choice.score.toFixed(3)})
                      </p>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Candidate</TableHead>
                              <TableHead>Bytes</TableHead>
                              <TableHead>Ratio</TableHead>
                              <TableHead>Encode ms</TableHead>
                              <TableHead>Score ↓</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {optimization.candidates.map((candidate) => (
                              <TableRow key={candidate.name}>
                                <TableCell>
                                  {candidate.name}
                                  {candidate === optimization.choice ? " ✓" : ""}
                                </TableCell>
                                <TableCell>{candidate.result.compressedSize}</TableCell>
                                <TableCell>
                                  {candidate.result.ratio === null
                                    ? "n/a"
                                    : `${(candidate.result.ratio * 100).toFixed(1)}%`}
                                </TableCell>
                                <TableCell>{candidate.encodeMs.toFixed(3)}</TableCell>
                                <TableCell>{candidate.score.toFixed(3)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Select one complete encoding. Scores normalize size and measured encoding
                        time across these candidates; lower is better. Timing is an average of 10
                        runs and may vary between devices.
                      </p>
                    </>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="panel-eyebrow mr-1">Animation speed</span>
              {(["slow", "normal", "fast"] as Speed[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={speed === s ? "default" : "secondary"}
                  onClick={() => setSpeed(s)}
                  className="capitalize"
                >
                  {s}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={skipToResult}
                disabled={!running}
                className="ml-2"
              >
                <FastForward className="mr-1.5 h-3.5 w-3.5" />
                Skip to result
              </Button>
            </div>

            <Button
              size="lg"
              onClick={handleRun}
              disabled={running || sampleLoading}
              className="min-w-44 font-semibold"
            >
              {running ? (
                <RotateCcw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {running ? "Running…" : "Run"}
            </Button>

            <section aria-label="Algorithm comparison" className="w-full">
              <h2 className="text-center text-xs text-muted-foreground">
                Comparison of all four algorithms on {start} → {goal}
              </h2>
              <div className="pt-3">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Algorithm</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead className="text-right">Distance</TableHead>
                      <TableHead className="text-right">Nodes expanded</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                      <TableHead className="text-right">Optimal?</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparison?.map(({ algo: a, label, result }) => (
                      <TableRow key={a} className={cn(a === algo && "bg-secondary/60")}>
                        <TableCell className="font-medium">{label}</TableCell>
                        <TableCell className="max-w-64 truncate font-mono text-xs text-muted-foreground">
                          {result.path.join(" → ")}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {result.distanceKm.toFixed(1)} km
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {result.expanded.length}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {result.timeMs.toFixed(2)} ms
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {result.optimal ? (
                            <span className="text-crypto">guaranteed</span>
                          ) : (
                            <span className="text-muted-foreground">not guaranteed</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        </footer>
      </main>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-2 text-center">
      <p className="panel-eyebrow">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold text-route">{value}</p>
    </div>
  );
}
