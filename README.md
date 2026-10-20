
mwuah

# Route & Cipher Explorer

Build "SmartRoute" as a single-page React + TypeScript + Tailwind

(shadcn/ui) web app. This is a client-side algorithm and cryptography

visualizer — do NOT add authentication, a database, or Supabase; nothing

needs to be saved between sessions, all computation happens in the

browser.

## Overall layout (one page, no tabs, three-zone layout)

- CENTER: a large, real interactive map using react-leaflet with

  OpenStreetMap tiles (pannable/zoomable, not a static image or an

  abstract chart). This is the visual anchor — give it the most space.

- LEFT panel: "Pathfinding" controls.

- RIGHT panel: "Cryptography" controls.

- BOTTOM, full width, centered: a multi-line text input for the message

  to encrypt, and a single centered "Run" button below it.

- Stack into a single vertical column on narrow/mobile widths, with the

  map always on top when stacked.

## Map data

Nationwide dataset: 50 cities / provincial capitals across Luzon,

Visayas, and Mindanao (full list in `src/lib/graph.ts`, grouped by

island group), plotted as markers on the map.

Edges are NOT hand-listed — the graph is generated at load time:

- Each city connects to its K nearest neighbors by great-circle

  (haversine) distance in km (K = 5, exposed as `K_NEAREST`).

- A union-find connectivity pass then finds disconnected components

  (island clusters) and adds the single minimum-distance edge between

  components until the graph is fully connected — so every route query

  between any two cities has an answer, even Luzon-to-Mindanao.

- Each edge is labeled "road" when both endpoints share an island group

  and are under 150 km apart, and "sea/air route" otherwise. Sea/air

  edges are drawn dashed on the map and called out in the pathfinding

  log (e.g. "Crossing to CebuCity via sea/air route — 320 km leg").

All edge weights are haversine distances in km, computed in TypeScript

at load time — no hardcoded distances.

On page load, before any run: show all city markers and edges on the

map immediately, fitted to the whole Philippines, so the map is never

empty or waiting on a run to appear.

## LEFT panel — Pathfinding

- Dropdown: algorithm — A*, Dijkstra, Greedy Best-First, Floyd-Warshall.

- Dropdown: start city, Dropdown: destination city.

- Implement all four as real TypeScript functions operating on the

  graph (not simulated/faked), each returning: the final path, total

  distance, an ORDERED array of expanded nodes (for animation), and

  elapsed computation time. A* and Greedy Best-First use the haversine

  distance to the goal as their heuristic.

- A live scrolling log area under the dropdowns that fills in one line

  per expansion step during the run, e.g. "Expanding Tarlac — 142.3 km

  so far."

- After the run: show distance, nodes expanded, and time as metric

  cards.

## RIGHT panel — Cryptography

- Dropdown: method — RSA, AES, Hash-only.

- Implement in TypeScript using the browser's native Web Crypto API

  (crypto.subtle) for AES-GCM and SHA-256. For RSA, hand-implement small

  demo-scale keys (e.g. 256-bit primes via a Miller-Rabin primality

  test) so the math (p, q, n, phi(n), e, d) is visibly generated and

  shown on screen, not hidden in a library — this is intentionally

  undersized for teaching purposes, not production security.

- A live log area showing each method's real intermediate steps as they

  happen: RSA (generating prime p -> generating prime q -> computing n

  -> computing phi(n) -> choosing e -> computing d -> encrypting a

  numeric fingerprint of the message), AES (generating a key -> showing

  plaintext -> encrypting), Hash-only (showing plaintext -> hashing ->

  revealing the digest).

- After encryption finishes, reveal the resulting keys/ciphertext/

  digest, and show a "Decrypt" button (RSA/AES) or "Verify integrity"

  button (Hash-only, since there's nothing to decrypt). Clicking it

  animates the reverse steps and reveals the original text, with a

  visible match/mismatch confirmation.

## Bottom bar and the Run button

- Text area: "Message to encrypt" — arbitrary user text, this is what

  the cryptography panel actually encrypts (not the route).

- "Animation speed" control (Slow/Normal/Fast) and a "Skip to result"

  option.

- Clicking Run starts ONE interleaved animation loop (e.g. driven by

  requestAnimationFrame or a fixed-interval timer) that, on each tick:

    a) reveals the next expanded city as a highlighted marker on the

       map, in real time, and appends the matching line to the left log

    b) advances the crypto method to its next step and appends the

       matching line to the right log

  so both sides visibly progress together, not one finishing before the

  other starts. When the pathfinding animation finishes, draw the final

  shortest path as a highlighted line over the map.

## Extra: algorithm comparison

Add a collapsible "Advanced" section

## Complexity Analysis

The bounds describe these implementations, not optimized textbook variants.
V is the number of cities, E the number of directed adjacency entries, K = 5
the nearest-neighbor setting, n the UTF-8 message length in bytes, m the
pattern length in UTF-16 code units, σ ≤ 256 the number of distinct bytes,
and L ≤ max(1, σ − 1) the maximum Huffman code length. For RSA, b is the
modulus bit length, k the Miller–Rabin round count, M(b) the cost of a b-bit
modular multiplication, and t = ceil(n / B) for block size B ≈ b / 8 bytes.
The searches sort an array on every removal and may enqueue multiple entries
for a city; they do not use a priority queue. Space includes produced output
unless otherwise stated.

| Algorithm | Time | Space (including output) | Notes |
| --- | --- | --- | --- |
| `haversineKm` | O(1) | O(1) | Fixed number of arithmetic/trigonometric operations per city pair. |
| `buildEdges` | O(V² log V + V⁴) conservative worst case | O(V + E) | K-nearest sorts V lists of V cities. Up to V bridge passes scan all city pairs; union-find has path compression but no rank, so a `find` can cost O(V). For fixed K, E = O(V). |
| Dijkstra | O(E² log E + V) worst case | O(V + E) | Array sorting dominates; includes up to O(E) queue entries. |
| A* | O(E² log E + V) worst case | O(V + E) | Same queue implementation; the heuristic can reduce work in practice. |
| Greedy Best-First | O(E² log E + V) worst case | O(V + E) | Same queue implementation; it does not guarantee a shortest path. |
| Floyd–Warshall | O(V³ + E) | O(V²) | Stores distance and next-hop matrices. |
| KMP | O(x + m) | O(m + z) | x and m are text and pattern lengths in UTF-16 code units; z is the number of matches. Comparisons include prefix-table construction. |
| Brute force | O(xm) | O(z) | Reports overlapping matches; x is the text length in UTF-16 code units. |
| Huffman `compress` / `decompress` | O(nL + σ² log σ) | O(nL + σL) | Packed output and code strings are included. Tree construction repeatedly sorts a list; decoding traverses encoded bits. |
| RLE `rleCompress` | O(n) | O(n) | Scans UTF-8 bytes into count-and-symbol records, splitting runs at 255 or 65535; includes the returned buffer. |
| RLE `rleDecompress` | O(n + c) | O(n) | n is original UTF-8 length and c is compressed length; validates records and fills the decoded buffer. |
| Compression optimizer | O(nL + σ² log σ) | O(nL + σL) | Measures complete Huffman and two RLE encodings 10 times each, then scores three candidates in O(3) using normalized size and time with a configurable weight; chooses one. Constants include 30 encode runs. |
| `modPow` | O(b M(b)) | O(b), excluding multiplication workspace | Square-and-multiply for an exponent of at most b bits; for RSA public exponent e, use O(log e · M(b)). |
| Miller–Rabin | O(k b M(b)) | O(b), excluding multiplication workspace | k rounds on a b-bit candidate; extra squarings are within the same bound. |
| RSA `randomPrime` / key generation | Expected O(k b² M(b)) | O(b), excluding multiplication workspace | About O(b) random odd b/2-bit candidates per prime; each may run Miller–Rabin. This is an expectation, not a finite worst-case bound. GCD and modular inverse add big-integer arithmetic. |
| RSA encryption in `runRsa` | O(n + t log e · M(b)) | O(n + tb) bits | UTF-8 block encoding plus one `modPow(m, e, n)` per block; e is typically 65537 here. |
| RSA decryption in `runRsa.reverse` | O(n + t b M(b)) | O(n + tb) bits | One `modPow(c, d, n)` per block, followed by byte reassembly. |
| AES-GCM `runAes` / `reverse` | O(n) | O(n) | Web Crypto key size, IV and authentication tag are fixed; each call processes the message once and retains input/output buffers. |
| SHA-256 `runHash` / `reverse` | O(n) | O(n) | Web Crypto digest is linear in message bytes; TextEncoder creates an O(n) buffer. Re-verification hashes the current field again. |

Compressed sizes include the Huffman frequency header or RLE header and run
records. The displayed ratio is compressed bytes divided by original UTF-8
bytes; it can exceed 100% for small inputs and is undefined for empty input.
The optimizer selects one actual encoding and displays all candidate sizes,
ratios, measured encode times, and normalized weighted scores. Timings vary
by device and run.

