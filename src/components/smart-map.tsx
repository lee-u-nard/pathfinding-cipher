import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { CITIES, EDGES, GRAPH, cityByName } from "@/lib/graph";

/* Leaflet path options need raw color values (SVG attributes), matched to the
   design tokens: --route amber, --crypto teal, muted slate for idle roads. */
const COLOR_ROAD = "#5b6478";
const COLOR_SEA = "#3f6f74";
const COLOR_CITY = "#9aa3b5";
const COLOR_ROUTE = "#e3b341";
const COLOR_START = "#3ddc97";
const COLOR_GOAL = "#fb7185";

/** Fit the whole archipelago on load instead of the old Luzon-only center. */
const BOUNDS = L.latLngBounds(CITIES.map((c) => [c.lat, c.lon] as [number, number])).pad(0.12);

export interface SmartMapProps {
  start: string;
  goal: string;
  /** Ordered names of cities revealed by the animation so far. */
  expanded: string[];
  /** City currently being expanded (pulsed), or null. */
  current: string | null;
  /** Final path to draw once the run completes. */
  path: string[] | null;
}

/** Tracks Leaflet zoom so labels/markers can adapt to the nationwide view. */
function useZoom(): number {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    const onZoom = () => setZoom(map.getZoom());
    map.on("zoomend", onZoom);
    return () => {
      map.off("zoomend", onZoom);
    };
  }, [map]);
  return zoom;
}

/** Everything that needs the live map instance (zoom) lives inside the container. */
function MapContent({ start, goal, expanded, current, path }: SmartMapProps) {
  const zoom = useZoom();
  const expandedSet = new Set(expanded);
  /* With 50 cities, always-on labels at the country view would be unreadable.
     Permanent labels appear when zoomed in; start/goal/current stay labeled
     at any zoom, and every marker still shows its name on hover. */
  const showAllLabels = zoom >= 7;
  const radius = zoom >= 8 ? 6 : 4.5;

  return (
    <>
      {/* All generated edges, always visible — solid gray for roads, dashed
          teal for sea/air crossings so the map is honest about the link type. */}
      {EDGES.map((e) => (
        <Polyline
          key={`${e.a}-${e.b}`}
          positions={[
            [cityByName.get(e.a)!.lat, cityByName.get(e.a)!.lon],
            [cityByName.get(e.b)!.lat, cityByName.get(e.b)!.lon],
          ]}
          pathOptions={
            e.kind === "road"
              ? { color: COLOR_ROAD, weight: 1.5, opacity: 0.5 }
              : { color: COLOR_SEA, weight: 1.5, opacity: 0.55, dashArray: "3 6" }
          }
        />
      ))}

      {/* Final shortest path, drawn per leg on top — sea/air legs stay dashed. */}
      {path &&
        path.length > 1 &&
        path.slice(1).map((to, i) => {
          const from = path[i]!;
          const kind = (GRAPH[from] ?? []).find((e) => e.to === to)?.kind ?? "road";
          return (
            <Polyline
              key={`path-${from}-${to}`}
              positions={[
                [cityByName.get(from)!.lat, cityByName.get(from)!.lon],
                [cityByName.get(to)!.lat, cityByName.get(to)!.lon],
              ]}
              pathOptions={{
                color: COLOR_ROUTE,
                weight: 4.5,
                opacity: 0.95,
                ...(kind === "sea" ? { dashArray: "6 8" } : {}),
              }}
            />
          );
        })}

      {CITIES.map((c) => {
        const isStart = c.name === start;
        const isGoal = c.name === goal;
        const isExpanded = expandedSet.has(c.name);
        const isCurrent = c.name === current;
        const fill = isStart
          ? COLOR_START
          : isGoal
            ? COLOR_GOAL
            : isExpanded
              ? COLOR_ROUTE
              : COLOR_CITY;
        return (
          <CircleMarker
            key={c.name}
            center={[c.lat, c.lon]}
            radius={isCurrent ? radius + 3 : radius}
            pathOptions={{
              color: isCurrent ? COLOR_ROUTE : "#11141c",
              weight: isCurrent ? 3 : 1.5,
              fillColor: fill,
              fillOpacity: 0.95,
            }}
          >
            <Tooltip
              /* remount when permanence flips so Leaflet drops stale labels */
              key={showAllLabels || isStart || isGoal || isCurrent ? "perm" : "hover"}
              permanent={showAllLabels || isStart || isGoal || isCurrent}
              direction="top"
              offset={[0, -7]}
              className="city-tooltip"
            >
              {c.name}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
}

export default function SmartMap(props: SmartMapProps) {
  return (
    <MapContainer
      bounds={BOUNDS}
      scrollWheelZoom
      minZoom={5}
      className="h-full w-full"
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapContent {...props} />
    </MapContainer>
  );
}
