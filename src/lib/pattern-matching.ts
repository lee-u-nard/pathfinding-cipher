export interface MatchResult {
  /** Zero-based UTF-16 offsets, as used by JavaScript strings. */
  positions: number[];
  /** Character comparisons, including KMP prefix-table construction. */
  comparisons: number;
}

/** Find overlapping matches. An empty pattern has no matches in this lab. */
export function bruteForceSearch(text: string, pattern: string): MatchResult {
  const positions: number[] = [];
  let comparisons = 0;
  if (!pattern.length) return { positions, comparisons };
  for (let i = 0; i <= text.length - pattern.length; i++) {
    let j = 0;
    while (j < pattern.length) {
      comparisons++;
      if (text[i + j] !== pattern[j]) break;
      j++;
    }
    if (j === pattern.length) positions.push(i);
  }
  return { positions, comparisons };
}

export function kmpSearch(text: string, pattern: string): MatchResult {
  const positions: number[] = [];
  let comparisons = 0;
  if (!pattern.length) return { positions, comparisons };
  const prefix = new Array<number>(pattern.length).fill(0);
  for (let i = 1, j = 0; i < pattern.length;) {
    comparisons++;
    if (pattern[i] === pattern[j]) prefix[i++] = ++j;
    else if (j > 0) j = prefix[j - 1]!;
    else prefix[i++] = 0;
  }
  for (let i = 0, j = 0; i < text.length;) {
    comparisons++;
    if (text[i] === pattern[j]) {
      i++;
      j++;
      if (j === pattern.length) {
        positions.push(i - j);
        j = prefix[j - 1]!;
      }
    } else if (j > 0) j = prefix[j - 1]!;
    else i++;
  }
  return { positions, comparisons };
}
