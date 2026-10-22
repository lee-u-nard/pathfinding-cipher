import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, GeoJSON, Polyline, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import "leaflet/dist/leaflet.css";
import {
  CITIES,
  INACCESSIBLE_CITIES,
  EDGES,
  GRAPH_ERROR,
  PROVINCE_DATASETS,
  roadSegments,
  type LatLng,
  type MapView,
} from "@/lib/graph";
import type { Expansion } from "@/lib/pathfinding";
import { Button } from "@/components/ui/button";

type Provinces = FeatureCollection<
  Polygon | MultiPolygon,
  { name: string; datasetId: string | null }
>;
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · Province outlines: <a href="https://github.com/faeldon/philippines-json-maps">faeldon (MIT)</a>';

export interface SmartMapProps {
  view: MapView;
  onViewChange: (view: MapView) => void;
  navigationDisabled: boolean;
  start: string;
  goal: string;
  expanded: string[];
  expansions: Expansion[];
  animationMs: number;
  current: string | null;
  path: string[] | null;
}

/** Resizing does not reset the user's pan/zoom; view changes deliberately fit bounds. */
function MapBehavior({
  view,
  provinces,
  onZoomLock,
}: {
  view: MapView;
  provinces: Provinces | null;
  onZoomLock: (locked: boolean) => void;
}) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const resize = () => map.invalidateSize({ pan: false });
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const unlock = () => {
      map.scrollWheelZoom.enable();
      onZoomLock(false);
    };
    const lock = () => {
      map.scrollWheelZoom.disable();
      onZoomLock(true);
    };
    const outside = (event: PointerEvent) => {
      if (!container.contains(event.target as Node)) lock();
    };
    const blur = (event: FocusEvent) => {
      if (!container.contains(event.relatedTarget as Node | null)) lock();
    };
    container.addEventListener("click", unlock);
    container.addEventListener("focusin", unlock);
    container.addEventListener("focusout", blur);
    container.addEventListener("mouseleave", lock);
    document.addEventListener("pointerdown", outside);
    map.attributionControl.addAttribution(ATTRIBUTION);
    return () => {
      observer.disconnect();
      container.removeEventListener("click", unlock);
      container.removeEventListener("focusin", unlock);
      container.removeEventListener("focusout", blur);
      container.removeEventListener("mouseleave", lock);
      document.removeEventListener("pointerdown", outside);
      map.attributionControl.removeAttribution(ATTRIBUTION);
    };
  }, [map, onZoomLock]);
  useEffect(() => {
    map.scrollWheelZoom.disable();
    onZoomLock(true);
    if (!provinces) return;
    const features =
      view === "philippines"
        ? provinces.features
        : provinces.features.filter((f) => f.properties.datasetId === view);
    const collection: Provinces = { type: "FeatureCollection", features };
    const bounds = L.geoJSON(collection).getBounds();
    if (view === "bohol")
      for (const city of [...CITIES, ...INACCESSIBLE_CITIES]) bounds.extend([city.lat, city.lon]);
    const frame = requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
    });
    return () => cancelAnimationFrame(frame);
  }, [map, view, provinces, onZoomLock]);
  return null;
}

/** Trace the SVG path itself, so the animation follows every road bend. */
function AnimatedRoad({
  positions,
  duration,
  color,
  weight = 4,
  delayMs = 0,
}: {
  positions: LatLng[];
  duration: number;
  color: string;
  weight?: number;
  delayMs?: number;
}) {
  const ref = useRef<L.Polyline>(null);
  useEffect(() => {
    const path = ref.current?.getElement() as SVGPathElement | undefined;
    if (!path || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const length = path.getTotalLength();
    const animation = path.animate(
      [
        { strokeDasharray: `${length} ${length}`, strokeDashoffset: length },
        { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0 },
      ],
      { duration, delay: delayMs, easing: "linear", fill: "backwards" },
    );
    return () => animation.cancel();
  }, [positions, duration, delayMs]);
  return (
    <Polyline
      ref={ref}
      positions={positions}
      pathOptions={{ color, weight, opacity: 0.95 }}
      interactive={false}
    />
  );
}

function RoadGraph({
  start,
  goal,
  expanded,
  expansions,
  current,
  path,
  animationMs,
}: SmartMapProps) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    map.on("zoomend", update);
    return () => {
      map.off("zoomend", update);
    };
  }, [map]);
  const finalLegs = useMemo(
    () =>
      path?.slice(1).map((to, i) => ({
        key: `${path[i]}-${to}`,
        segments: roadSegments(path[i]!, to),
      })) ?? [],
    [path],
  );
  const traversed = useMemo(
    () =>
      expansions
        .filter((e) => e.via)
        .map((e) => ({
          key: `${e.via!.from}-${e.node}`,
          segments: roadSegments(e.via!.from, e.node),
        })),
    [expansions],
  );
  return (
    <>
      {INACCESSIBLE_CITIES.map((city) => (
        <CircleMarker
          key={city.id}
          center={[city.lat, city.lon]}
          radius={6}
          pathOptions={{
            color: "#9aa3b5",
            fillColor: "#404754",
            fillOpacity: 0.8,
            dashArray: "3 3",
          }}
        >
          <Tooltip permanent direction="top" className="city-tooltip">
            {city.name} · no road connection
          </Tooltip>
        </CircleMarker>
      ))}
      {EDGES.map((edge) => (
        <Polyline
          key={`${edge.a}-${edge.b}`}
          positions={edge.road}
          pathOptions={{ color: "#778299", weight: 2, opacity: 0.65 }}
        >
          <Tooltip>
            {edge.a} → {edge.b} · {edge.km.toFixed(2)} km
          </Tooltip>
        </Polyline>
      ))}
      {EDGES.flatMap((edge) =>
        edge.access.map((line, i) => (
          <Polyline
            key={`access-${edge.a}-${edge.b}-${i}`}
            positions={line}
            pathOptions={{ color: "#b2bdce", weight: 2, dashArray: "3 4" }}
          >
            <Tooltip>Approximate town-center access · included in distance</Tooltip>
          </Polyline>
        )),
      )}
      {traversed.map(
        (edge) =>
          edge.segments && (
            <AnimatedRoad
              key={edge.key}
              positions={edge.segments.road}
              duration={animationMs}
              color="#61b7c4"
              weight={3}
            />
          ),
      )}
      {finalLegs.map(
        (edge, i) =>
          edge.segments && (
            <AnimatedRoad
              key={`final-${edge.key}`}
              positions={edge.segments.road}
              delayMs={i * animationMs}
              duration={animationMs}
              color="#e3b341"
              weight={5}
            />
          ),
      )}
      {finalLegs.flatMap(
        (edge) =>
          edge.segments?.access.map((line, i) => (
            <Polyline
              key={`final-access-${edge.key}-${i}`}
              positions={line}
              pathOptions={{ color: "#e3b341", weight: 4, dashArray: "3 4" }}
              interactive={false}
            />
          )) ?? [],
      )}
      {CITIES.map((city) => {
        const selected = city.name === start || city.name === goal || city.name === current;
        const permanent = zoom >= 11 || selected;
        const color =
          city.name === start
            ? "#3ddc97"
            : city.name === goal
              ? "#fb7185"
              : expanded.includes(city.name)
                ? "#e3b341"
                : "#b2bdce";
        return (
          <CircleMarker
            key={city.id}
            center={[city.lat, city.lon]}
            radius={city.name === current ? 8 : 5}
            pathOptions={{ color: "#11141c", weight: 2, fillColor: color, fillOpacity: 1 }}
          >
            <Tooltip
              key={permanent ? "permanent" : "hover"}
              permanent={permanent}
              direction="top"
              offset={[0, -7]}
              className="city-tooltip"
            >
              {city.name}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

export default function SmartMap(props: SmartMapProps) {
  // Leaflet keeps feature handlers from layer creation; read current navigation state.
  const navigation = useRef(props);
  navigation.current = props;
  const [provinces, setProvinces] = useState<Provinces | null>(null);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/ph-provinces.geo.json`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Province boundaries are missing");
        const data = (await response.json()) as Provinces;
        if (
          data.type !== "FeatureCollection" ||
          !data.features?.some((f) => f.properties?.datasetId === "bohol")
        )
          throw new Error("Province boundaries are invalid");
        setProvinces(data);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            `${cause instanceof Error ? cause.message : "Cannot load map data"}. Run npm run build:data, then restart or rebuild the app.`,
          );
      });
    return () => controller.abort();
  }, []);
  return (
    <div className="relative h-full w-full isolate">
      <MapContainer
        center={[12, 123]}
        zoom={5}
        minZoom={4}
        maxZoom={18}
        scrollWheelZoom={false}
        className="h-full w-full"
        style={{ height: "100%", width: "100%", background: "#0f1724" }}
      >
        <MapBehavior view={props.view} provinces={provinces} onZoomLock={setLocked} />
        {provinces && (
          <GeoJSON
            key={props.view}
            data={provinces}
            style={(feature) => ({
              color: feature?.properties.datasetId ? "#e3b341" : "#63748d",
              weight: 1,
              fillColor: feature?.properties.datasetId ? "#736031" : "#283b50",
              fillOpacity: 0.75,
            })}
            onEachFeature={(feature, layer) => {
              const name = feature.properties?.name;
              const dataset = PROVINCE_DATASETS[name as keyof typeof PROVINCE_DATASETS];
              if (!dataset || props.view !== "philippines") return;
              layer.bindTooltip("Bohol — click to explore roads");
              layer.on({
                mouseover: () =>
                  (layer as L.Path).setStyle({ fillColor: "#e3b341", fillOpacity: 0.9 }),
                mouseout: () =>
                  (layer as L.Path).setStyle({ fillColor: "#736031", fillOpacity: 0.75 }),
                click: () => {
                  if (!navigation.current.navigationDisabled)
                    navigation.current.onViewChange(dataset.id);
                },
              });
            }}
          />
        )}
        {props.view === "bohol" && !GRAPH_ERROR && <RoadGraph {...props} />}
      </MapContainer>
      {props.view === "bohol" && !GRAPH_ERROR && (
        <div className="pointer-events-none absolute bottom-6 left-3 z-[1000] rounded bg-card/95 px-2 py-1 text-[10px] text-muted-foreground">
          Solid: routed road · dashed: approximate center access
          <br />
          Distances include access · Carlos P. Garcia has no road connection
        </div>
      )}
      <div className="absolute right-3 top-3 z-[1000] flex max-w-[75%] flex-col items-end gap-2">
        {props.view === "bohol" ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={props.navigationDisabled}
            onClick={() => props.onViewChange("philippines")}
          >
            Back to Philippines
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={!provinces || props.navigationDisabled}
            onClick={() => props.onViewChange("bohol")}
          >
            Explore Bohol
          </Button>
        )}
        <span className="pointer-events-none rounded bg-card/95 px-2 py-1 text-xs text-muted-foreground">
          {locked
            ? "Click map to enable scroll zoom"
            : "Scroll zoom enabled · leave map to scroll page"}
        </span>
      </div>
      {(error || (props.view === "bohol" && GRAPH_ERROR) || !provinces) && (
        <div
          role="status"
          className="absolute bottom-8 left-3 right-3 z-[1000] rounded border border-border bg-card/95 p-3 text-sm"
        >
          {error || (props.view === "bohol" && GRAPH_ERROR) || "Loading local province outlines…"}
        </div>
      )}
    </div>
  );
}
