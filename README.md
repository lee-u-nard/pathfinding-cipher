# Pathfinding Cipher

A React/TypeScript teaching app with a local Philippines province map and a
Bohol road-network view, alongside RSA, AES-GCM, SHA-256, live KMP/brute-force
matching, Huffman/RLE compression and a weighted compression optimizer.

## Run

Use Node.js 22.18+ (or Node 24) and npm:

```sh
npm install
npm run build:data
npm run dev
```

For production, run `npm run build`. Type-check with `npx tsc --noEmit`.
Generated graph JSON is bundled at build time: restart Vite after generating
it, and regenerate the production build before deploying changed data.

## Map and controls

The default view shows simplified province/district boundaries. Hover Bohol
and click it (or use **Explore Bohol**) to fit its bounds and reveal its road
network. **Back to Philippines** restores the country view. Other provinces
are display-only; `PROVINCE_DATASETS` in `src/lib/graph.ts` is the registry
for adding future datasets. The searchable town pickers contain only the
47 road-connected Bohol nodes and are enabled in the Bohol view. President Carlos
P. Garcia is shown separately as road-inaccessible and excluded from route choices,
as agreed: its island has a sea connection, not a road bridge to mainland Bohol.

The middle column scrolls as a unit, including the map; both desktop sidebars
scroll independently. The map retains its 55vh/55dvh height and minimum of
360px/400px. Wheel input scrolls the column until the map is clicked or focused;
leaving the map or clicking outside locks wheel zoom again. Dragging and +/-
buttons always work. ResizeObserver keeps Leaflet dimensions up to date.

Road edges and animations use stored road polylines. A*/Greedy use haversine
between town centers; Dijkstra uses road length. All road weights are at least
the endpoint haversine distance, so the A* heuristic is consistent and
admissible. Floyd-Warshall animates intermediate-vertex passes (not traversal
edges); all algorithms trace the final route along its actual stored geometry.
The comparison table stays visible below the map. During a run, province
navigation is disabled to keep the animation and selected graph consistent.

Crypto and Text Lab work even if road data is absent or the country view is
selected. Sample loading and manual typing still share the same message field.

## Short classroom demo

1. Click **Load sample text** and expand **Text Analysis Lab**. The sample's
   repeated `pattern` word makes the live KMP/brute-force match positions and
   comparison counts easy to show.
2. Click **Compare compression methods**. Point out the original byte count,
   compressed byte count, ratio, and successful decompression check. Huffman
   and both RLE settings encode the same message.
3. Move the **File size / speed** slider. The table shows each candidate's
   actual size, measured time, and score; the lowest score is selected. This
   demonstrates discrete optimization over three compression settings.
4. Select **RSA** and press **Run**. Its key-generation log shows Miller-Rabin
   probable-prime tests, the project's randomized algorithm. The complexity
   table below covers the main algorithms' time and space costs.

## Reproducible offline data pipeline

`npm run build:data` runs `scripts/build-bohol-graph.mjs`. Network requests
occur **only in this script**. The application uses bundled road JSON and
same-origin province JSON; it does not request external map tiles or routing APIs.

1. Download the public [faeldon Philippines JSON maps](https://github.com/faeldon/philippines-json-maps)
   2023 province/district boundaries from each region. Resolve the source Git
   tree once, pin raw downloads to that commit, simplify with Douglas-Peucker
   tolerance 0.005 degrees, retain Bohol and source names, and copy the MIT license.
   An explicitly unassigned source feature is omitted and reported.
2. Query [OpenStreetMap through Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API)
   for Bohol municipality relations, place nodes and road bridges. **Philippine
   municipalities/cities use admin_level=6**, not 8; both are queried, with
   level-8 results accepted only if explicitly tagged municipality/city. See
   the [OSM Philippines convention](https://wiki.openstreetmap.org/wiki/Philippines/Mapping_conventions/Local_government).
   Require 48 complete boundaries, including Tagbilaran City and Panglao. The
   downloaded OSM data has only 14 municipal polygons, so the builder falls back
   to the same public PSGC repository's complete Bohol municipal boundary file.
   This fallback is recorded in the metadata/report; all 48 centers remain OSM nodes.
3. Use each relation's town/city `admin_centre` place node, or a uniquely named
   town/city place node inside its boundary. Coordinates are preserved exactly
   as mapped in OSM; polygon centroids and hand-entered locations are never used.
   OSM accuracy is not a surveying guarantee. Unlinked offshore barangays are
   not separate graph nodes.
4. Candidate pairs share a boundary way or have touching/intersecting polygons
   (the public PSGC topology has small overlaps along shared boundaries). OSM road bridges
   also qualify a pair when boundaries stop at coastlines, covering bridge-linked
   islands without inventing sea connections. Bridge endpoints are classified
   using OSM municipal polygons where available, since the PSGC land polygons
   stop at the coast. This finds the Butalid Causeway between Tagbilaran and Dauis.
5. Request full driving route geometries from the [OSRM demo service](https://project-osrm.org/docs/v5.24.0/api/),
   rejecting any returned route with ferry steps (the demo server does not support
   the ferry exclusion flag). Try returned alternatives; reject routes spending more than
   100 m in a third municipality. Territory checks sample segments at <=50 m;
   the 100 m allowance handles boundary slivers and is an explicit approximation.
6. Preserve exact OSM center markers and the actual OSRM road endpoints. As agreed,
   connect them with separately styled **dashed approximate access segments**;
   they are not claimed to be surveyed road geometry. The largest downloaded
   center-to-road gap is 62.4 m; reject new gaps above 150 m for manual review.
   Keep the OSRM-reported distance and snap offsets as provenance. The algorithm
   weight is the haversine sum along the stored road plus both access connectors.
   Simplify at about 2 m tolerance, reducing it until length loss is <=0.1%.
7. Store each undirected edge once. Check 48 centers (47 road nodes plus Carlos P. Garcia), required towns, endpoints,
   distance >= straight-line, and connectivity of the 47 road nodes. Print node/edge counts, average
   degree, disconnected components, rejected pairs and suspicious detours.
   Never repair connectivity with invented straight lines or ferry edges.
   Failed validation stops publication of the graph. The runtime independently
   validates the schema, unique pairs, endpoints, weights and connectivity.

Outputs:

- `public/data/ph-provinces.geo.json`: simplified local map background.
- `public/data/province-source-LICENSE.txt`: boundary source license.
- `src/data/bohol-graph.json`: nodes, undirected road polylines, source metadata,
  weights, original OSRM distances and endpoint snap distances.
- `public/data/bohol-build-report.json`: components, counts, warnings and rejected routes.
- `.cache/bohol-data/`: ignored raw-response cache, keyed by request URL.

Requests run serially, spaced at least 1.1 seconds apart, with three attempts,
exponential backoff and a 180-second timeout per request. Cached successful
responses make reruns fast; failed HTTP responses are not cached. Keep the cache
for identical inputs; move it aside when deliberately refreshing OSM data.
`OVERPASS_URL` can select another Overpass interpreter; `OSRM_URL` can select
another compatible driving router. For example in PowerShell:

```powershell
$env:OVERPASS_URL = 'https://overpass.kumi.systems/api/interpreter'
npm run build:data
```

To generate only the province background: `npm run build:data -- --provinces-only`.
If downloads fail, run `npm run build:data` on a machine with access to those
servers, then restart/rebuild. The app gives this instruction when files are
missing; it never substitutes a made-up graph. If validation reports disconnected
towns, inspect the named rejected pairs and original OSM/OSRM responses, correct
source mapping or use a current routing dataset, and rerun. A failed rebuild
leaves any previously validated graph in place; its generatedAt records its age.

Run `npm run test:graph` to check malformed-data rejection, connectivity,
heuristic consistency, valid path edges and agreement between A*, Dijkstra and
Floyd-Warshall on both fixtures and the generated dataset. All source downloads
needed for this snapshot succeeded. Of 108 candidate pairs, 31 were excluded
because returned routes traversed a third municipality (or used a ferry).
No accepted edge triggered the >3× straight-line detour warning. The report
records all rejected pairs and approximate access offsets; routes have not been
surveyed on the ground. Undirected edges intentionally ignore direction-specific
driving restrictions for this teaching simulation.

<!-- graph-counts:start -->

Validated graph: V = 47, E = 77 undirected roads (154 adjacency entries). All 48 town centers are shown; President Carlos P. Garcia is road-inaccessible.
<!-- graph-counts:end -->

Map data: **© OpenStreetMap contributors**, available under the
[Open Database License](https://www.openstreetmap.org/copyright).
Province boundaries: faeldon/philippines-json-maps (MIT), derived from the
Philippines PSGC shapefile project. These are educational boundary snapshots,
not an authoritative/current legal boundary service.

## Complexity Analysis

The bounds describe these implementations, not optimized textbook variants.
V = 47 routable town centers; E counts undirected roads (2E adjacency entries).
The current validated snapshot has E = 77, hence 154 adjacency entries.
P is the number of stored polyline vertices. n is the UTF-8 message length in bytes, m the
pattern length in UTF-16 code units, σ ≤ 256 the number of distinct bytes,
and L ≤ max(1, σ − 1) the maximum Huffman code length. For RSA, b is the
modulus bit length, k the Miller–Rabin round count, M(b) the cost of a b-bit
modular multiplication, and t = ceil(n / B) for block size B ≈ b / 8 bytes.
The searches sort an array on every removal and may enqueue multiple entries
for a city; they do not use a priority queue. Space includes produced output
unless otherwise stated.

| Algorithm                                | Time                       | Space (including output)                 | Notes                                                                                                                                                                                                         |
| ---------------------------------------- | -------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `haversineKm`                            | O(1)                       | O(1)                                     | Fixed number of arithmetic/trigonometric operations per city pair.                                                                                                                                            |
| Graph loading / validation (`loadGraph`) | O(V + E + P)               | O(V + E + P)                             | Parses static JSON, checks geometry lengths/endpoints, builds adjacency and checks connectivity. The old nearest-neighbor `buildEdges` has been removed.                                                      |
| Dijkstra                                 | O(E² log E + V) worst case | O(V + E)                                 | Array sorting dominates; includes up to O(E) queue entries.                                                                                                                                                   |
| A*                                       | O(E² log E + V) worst case | O(V + E)                                 | Same queue implementation; the heuristic can reduce work in practice.                                                                                                                                         |
| Greedy Best-First                        | O(E² log E + V) worst case | O(V + E)                                 | Same queue implementation; it does not guarantee a shortest path.                                                                                                                                             |
| Floyd–Warshall                           | O(V³ + E)                  | O(V²)                                    | Stores distance and next-hop matrices.                                                                                                                                                                        |
| KMP                                      | O(x + m)                   | O(m + z)                                 | x and m are text and pattern lengths in UTF-16 code units; z is the number of matches. Comparisons include prefix-table construction.                                                                         |
| Brute force                              | O(xm)                      | O(z)                                     | Reports overlapping matches; x is the text length in UTF-16 code units.                                                                                                                                       |
| Huffman `compress` / `decompress`        | O(nL + σ² log σ)           | O(nL + σL)                               | Packed output and code strings are included. Tree construction repeatedly sorts a list; decoding traverses encoded bits.                                                                                      |
| RLE `rleCompress`                        | O(n)                       | O(n)                                     | Scans UTF-8 bytes into count-and-symbol records, splitting runs at 255 or 65535; includes the returned buffer.                                                                                                |
| RLE `rleDecompress`                      | O(n + c)                   | O(n)                                     | n is original UTF-8 length and c is compressed length; validates records and fills the decoded buffer.                                                                                                        |
| Compression optimizer                    | O(nL + σ² log σ)           | O(nL + σL)                               | Measures complete Huffman and two RLE encodings 10 times each, then scores three candidates in O(3) using normalized size and time with a configurable weight; chooses one. Constants include 30 encode runs. |
| `modPow`                                 | O(b M(b))                  | O(b), excluding multiplication workspace | Square-and-multiply for an exponent of at most b bits; for RSA public exponent e, use O(log e · M(b)).                                                                                                        |
| Miller–Rabin                             | O(k b M(b))                | O(b), excluding multiplication workspace | k rounds on a b-bit candidate; extra squarings are within the same bound.                                                                                                                                     |
| RSA `randomPrime` / key generation       | Expected O(k b² M(b))      | O(b), excluding multiplication workspace | About O(b) random odd b/2-bit candidates per prime; each may run Miller–Rabin. This is an expectation, not a finite worst-case bound. GCD and modular inverse add big-integer arithmetic.                     |
| RSA encryption in `runRsa`               | O(n + t log e · M(b))      | O(n + tb) bits                           | UTF-8 block encoding plus one `modPow(m, e, n)` per block; e is typically 65537 here.                                                                                                                         |
| RSA decryption in `runRsa.reverse`       | O(n + t b M(b))            | O(n + tb) bits                           | One `modPow(c, d, n)` per block, followed by byte reassembly.                                                                                                                                                 |
| AES-GCM `runAes` / `reverse`             | O(n)                       | O(n)                                     | Web Crypto key size, IV and authentication tag are fixed; each call processes the message once and retains input/output buffers.                                                                              |
| SHA-256 `runHash` / `reverse`            | O(n)                       | O(n)                                     | Web Crypto digest is linear in message bytes; TextEncoder creates an O(n) buffer. Re-verification hashes the current field again.                                                                             |

Compressed sizes include the Huffman frequency header or RLE header and run
records. The displayed ratio is compressed bytes divided by original UTF-8
bytes; it can exceed 100% for small inputs and is undefined for empty input.
The optimizer selects one actual encoding and displays all candidate sizes,
ratios, measured encode times, and normalized weighted scores. Timings vary
by device and run.

Offline generation has additional geometry costs. With at most B boundary
segments per municipality, testing all pairs is conservatively O(V²B²).
If R route samples are examined, territory classification is O(RVB), and
Douglas-Peucker simplification is O(P²) worst case. Stored geometry and cached
responses occupy O(VB + P + R) space; external service latency is outside these
CPU bounds. Runtime algorithms use the generated adjacency list, not this pipeline.
