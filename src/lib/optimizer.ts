import { compress, rleCompress, type CompressionResult } from "./compression";

export interface CompressionCandidate {
  name: string;
  result: CompressionResult;
  encodeMs: number;
}

/** Measure complete, decodable encodings. Repeat to smooth timer noise on short messages. */
export function measureCompressionCandidates(text: string): CompressionCandidate[] {
  const settings = [
    { name: "Huffman", encode: () => compress(text) },
    { name: "RLE · 1-byte runs", encode: () => rleCompress(text, 1) },
    { name: "RLE · 2-byte runs", encode: () => rleCompress(text, 2) },
  ];
  return settings.map(({ name, encode }) => {
    let result!: CompressionResult;
    const start = performance.now();
    for (let i = 0; i < 10; i++) result = encode();
    return { name, result, encodeMs: (performance.now() - start) / 10 };
  });
}

export interface ScoredCandidate extends CompressionCandidate {
  /** Lower is better; size and time are each normalized to the candidate range. */
  score: number;
}

/** Discrete constrained optimization: select one encoding with a weighted cost. */
export function optimizeCompression(candidates: CompressionCandidate[], speedWeight: number) {
  if (!candidates.length) throw new Error("At least one compression candidate is required");
  const weight = Math.max(0, Math.min(1, speedWeight));
  const sizes = candidates.map(({ result }) => result.compressedSize);
  const times = candidates.map(({ encodeMs }) => encodeMs);
  const minSize = Math.min(...sizes);
  const sizeRange = Math.max(...sizes) - minSize;
  const minTime = Math.min(...times);
  const timeRange = Math.max(...times) - minTime;
  const scored: ScoredCandidate[] = candidates.map((candidate) => ({
    ...candidate,
    score:
      (1 - weight) * (sizeRange ? (candidate.result.compressedSize - minSize) / sizeRange : 0) +
      weight * (timeRange ? (candidate.encodeMs - minTime) / timeRange : 0),
  }));
  const choice = scored.reduce((best, candidate) =>
    candidate.score < best.score ||
    (candidate.score === best.score && candidate.result.compressedSize < best.result.compressedSize)
      ? candidate
      : best,
  );
  return { choice, candidates: scored, speedWeight: weight };
}
