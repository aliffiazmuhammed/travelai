import React, { useState, useMemo, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  CircleMarker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Navigation,
  Bed,
  Eye,
  Calendar,
  Sparkles,
  Car,
  Route as RouteIcon,
  Pencil,
  Trash2,
  Undo2,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { formatDistance, formatDuration, pathLengthKm, totalRoute } from "@/lib/geo";
import { routeModeMeta } from "@/lib/routeStyle";
import { riskMeta } from "@/lib/weather";
import { RouteEditor } from "./RouteEditor";
import type {
  CustomRoute,
  DailyWeather,
  ItineraryData,
  NearbyPlace,
  RouteInput,
  Trip,
} from "@/types/trip";

interface TripMapProps {
  destination: string;
  itinerary: ItineraryData["day_by_day_itinerary"];
  /** Persisted trip id (required to save drawn routes). */
  tripId?: string;
  /** Saved custom routes for this trip. */
  customRoutes?: CustomRoute[];
  /** Whether the trip is persisted and the user may edit it. */
  canEdit?: boolean;
  /** Called with the updated trip after a route is saved or removed. */
  onUpdated?: (trip: Trip) => void;
  /** Nearby search results to surface as map markers (Milestone 4.5). */
  nearbyPlaces?: NearbyPlace[];
  /** Per-day weather risk shown on the day filter pills (Milestone 4.4). */
  weatherByDay?: Record<number, DailyWeather>;
}

// Comprehensive coordinates database for Indian & world travel hubs
const DESTINATION_COORDS: Record<string, [number, number]> = {
  // Kerala & South India
  wayanad: [11.6854, 76.1320],
  kerala: [10.8505, 76.2711],
  munnar: [10.0889, 77.0595],
  alleppey: [9.4981, 76.3388],
  alappuzha: [9.4981, 76.3388],
  kochi: [9.9312, 76.2673],
  cochin: [9.9312, 76.2673],
  varkala: [8.7379, 76.7163],
  kovalam: [8.4004, 76.9787],
  trivandrum: [8.5241, 76.9366],
  thiruvananthapuram: [8.5241, 76.9366],
  thekkady: [9.6031, 77.1615],
  kumarakom: [9.6175, 76.4301],
  vagamon: [9.6877, 76.9056],
  athirappilly: [10.2979, 76.5414],
  bekal: [12.3929, 75.0322],
  calicut: [11.2588, 75.7804],
  kozhikode: [11.2588, 75.7804],
  kannur: [11.8745, 75.3704],

  // Karnataka & Tamil Nadu
  coorg: [12.4244, 75.7382],
  kodagu: [12.4244, 75.7382],
  madikeri: [12.4244, 75.7382],
  chikmagalur: [13.3161, 75.7720],
  chikkamagaluru: [13.3161, 75.7720],
  hampi: [15.3350, 76.4600],
  gokarna: [14.5479, 74.3188],
  mysore: [12.2958, 76.6394],
  mysuru: [12.2958, 76.6394],
  bangalore: [12.9716, 77.5946],
  bengaluru: [12.9716, 77.5946],
  dandeli: [15.2361, 74.6173],
  kabini: [11.9333, 76.3500],
  ooty: [11.4102, 76.6950],
  udhagamandalam: [11.4102, 76.6950],
  kodaikanal: [10.2381, 77.4892],
  coonoor: [11.3530, 76.7959],
  pondicherry: [11.9416, 79.8083],
  puducherry: [11.9416, 79.8083],
  chennai: [13.0827, 80.2707],
  madurai: [9.9252, 78.1198],
  rameshwaram: [9.2876, 79.3129],
  kanyakumari: [8.0883, 77.5385],
  mahabalipuram: [12.6269, 80.1927],
  hyderabad: [17.3850, 78.4867],
  visakhapatnam: [17.6868, 83.2185],
  vizag: [17.6868, 83.2185],

  // Goa & Maharashtra
  goa: [15.2993, 74.1240],
  mumbai: [19.0760, 72.8777],
  pune: [18.5204, 73.8567],
  lonavala: [18.7557, 73.4091],
  mahabaleshwar: [17.9307, 73.6477],
  alibaug: [18.6414, 72.8722],
  matheran: [18.9866, 73.2680],
  nashik: [19.9975, 73.7898],
  shirdi: [19.7667, 74.4764],
  panchgani: [17.9237, 73.8018],
  aurangabad: [19.8762, 75.3433],

  // North India & Himalayas
  manali: [32.2432, 77.1892],
  shimla: [31.1048, 77.1734],
  rishikesh: [30.0869, 78.2676],
  haridwar: [29.9457, 78.1642],
  dehradun: [30.3165, 78.0322],
  mussoorie: [30.4598, 78.0644],
  nainital: [29.3919, 79.4542],
  corbett: [29.5300, 78.7747],
  leh: [34.1526, 77.5771],
  ladakh: [34.1526, 77.5771],
  srinagar: [34.0837, 74.7973],
  kashmir: [34.0837, 74.7973],
  gulmarg: [34.0484, 74.3805],
  pahalgam: [34.0161, 75.3150],
  dharamshala: [32.2190, 76.3234],
  mcleodganj: [32.2426, 76.3213],
  kasol: [32.0100, 77.3150],
  spiti: [32.2461, 78.0349],
  dalhousie: [32.5387, 75.9710],
  kullu: [31.9579, 77.1095],
  auli: [30.5292, 79.5694],
  amritsar: [31.6340, 74.8723],
  delhi: [28.6139, 77.2090],

  // Rajasthan & Golden Triangle
  jaipur: [26.9124, 75.7873],
  udaipur: [24.5854, 73.7125],
  jodhpur: [26.2389, 73.0243],
  jaisalmer: [26.9157, 70.9083],
  pushkar: [26.4899, 74.5511],
  "mount abu": [24.5925, 72.7156],
  ranthambore: [26.0173, 76.5026],
  bikaner: [28.0229, 73.3119],
  agra: [27.1767, 78.0081],
  varanasi: [25.3176, 82.9739],
  khajuraho: [24.8318, 79.9199],

  // East & North East
  darjeeling: [27.0410, 88.2663],
  gangtok: [27.3389, 88.6065],
  sikkim: [27.3389, 88.6065],
  shillong: [25.5788, 91.8933],
  meghalaya: [25.4670, 91.3662],
  cherrapunji: [25.2702, 91.7323],
  kaziranga: [26.5775, 93.1711],
  tawang: [27.5861, 91.8656],
  andaman: [11.6234, 92.7265],
  havelock: [11.9761, 92.9876],
  kolkata: [22.5726, 88.3639],
  puri: [19.8135, 85.8312],

  // Global Hubs
  bali: [-8.4095, 115.1889],
  dubai: [25.2048, 55.2708],
  singapore: [1.3521, 103.8198],
  bangkok: [13.7563, 100.5018],
  phuket: [7.8804, 98.3923],
  maldives: [3.2028, 73.2207],
  tokyo: [35.6762, 139.6503],
  paris: [48.8566, 2.3522],
  london: [51.5074, -0.1278],
  rome: [41.9028, 12.4964],
  amsterdam: [52.3676, 4.9041],
  switzerland: [46.8182, 8.2275],
  zurich: [47.3769, 8.5417],
  kathmandu: [27.7172, 85.3240],
  nepal: [27.7172, 85.3240],
  bhutan: [27.5142, 90.4336],
  colombo: [6.9271, 79.8612],
};

const DAY_COLORS = [
  "#38bdf8", // Sky blue
  "#10b981", // Emerald
  "#f97316", // Orange
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#f59e0b", // Amber
];

// Helper to look up coordinates from any text (destination, title, or activities)
const findCoordsFromText = (text: string): [number, number] | null => {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [key, coords] of Object.entries(DESTINATION_COORDS)) {
    if (lower.includes(key)) {
      return coords;
    }
  }
  return null;
};

// Helper to create modern styled HTML divIcon pins
const createCustomPin = (text: string, color: string, isHotel: boolean = false) => {
  return L.divIcon({
    className: "custom-leaflet-marker",
    html: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background-color: ${color};
        color: white;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        font-weight: 800;
        font-size: ${isHotel ? "14px" : "11px"};
      ">
        ${isHotel ? "🏨" : text}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
};

// Map Recenter Helper component
const MapViewUpdater: React.FC<{ center: [number, number]; zoom: number }> = ({
  center,
  zoom,
}) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [center, zoom, map]);
  return null;
};

// Captures map clicks while the user is drawing a custom route
const DrawClickHandler: React.FC<{
  active: boolean;
  onAddPoint: (point: [number, number]) => void;
}> = ({ active, onAddPoint }) => {
  useMapEvents({
    click(event) {
      if (!active) return;
      onAddPoint([event.latlng.lat, event.latlng.lng]);
    },
  });
  return null;
};

// Small travel-mode glyph used in the saved-routes list
const RouteModeIcon: React.FC<{ mode: CustomRoute["mode"]; className?: string }> = ({
  mode,
  className,
}) => {
  const { Icon } = routeModeMeta(mode);
  return <Icon className={className} />;
};

export const TripMap: React.FC<TripMapProps> = ({
  destination,
  itinerary,
  tripId,
  customRoutes,
  canEdit = false,
  onUpdated,
  nearbyPlaces,
  weatherByDay,
}) => {
  const [selectedDay, setSelectedDay] = useState<number | "all">("all");

  // --- User-drawn custom routes (Milestone 4) ---
  const [routes, setRoutes] = useState<CustomRoute[]>(customRoutes || []);
  const [drawing, setDrawing] = useState(false);
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [routeEditorOpen, setRouteEditorOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<CustomRoute | null>(null);
  const [busyRouteId, setBusyRouteId] = useState<string | null>(null);

  useEffect(() => setRoutes(customRoutes || []), [customRoutes]);

  const draftDistanceKm = useMemo(
    () => (draftPoints.length >= 2 ? pathLengthKm(draftPoints) : 0),
    [draftPoints]
  );

  // Determine initial coordinates from dictionary or itinerary scan
  const initialCoord = useMemo<[number, number]>(() => {
    const directMatch = findCoordsFromText(destination);
    if (directMatch) return directMatch;

    if (itinerary && itinerary.length > 0) {
      const allText = itinerary
        .map((d) => `${d.title} ${d.activities.join(" ")} ${d.stay_recommendations?.join(" ") || ""}`)
        .join(" ");
      const itineraryMatch = findCoordsFromText(allText);
      if (itineraryMatch) return itineraryMatch;
    }

    return [11.6854, 76.1320]; // Default to scenic Wayanad / South India instead of Delhi
  }, [destination, itinerary]);

  const [baseCoord, setBaseCoord] = useState<[number, number]>(initialCoord);
  const [detectedLocation, setDetectedLocation] = useState<string>("");
  const [routeInfo, setRouteInfo] = useState<{
    km: number;
    minutes: number;
    provider: string;
  } | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document !== "undefined") {
      return (
        document.documentElement.classList.contains("dark") ||
        localStorage.getItem("travelai_theme") === "dark"
      );
    }
    return false;
  });

  // Track light/dark mode changes to switch map tiles seamlessly
  useEffect(() => {
    if (typeof document === "undefined") return;
    const updateTheme = () => {
      setIsDark(
        document.documentElement.classList.contains("dark") ||
        localStorage.getItem("travelai_theme") === "dark"
      );
    };
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Sync initialCoord changes
  const cartoApiKey = import.meta.env.VITE_CARTO_API_KEY;

  const tileConfig = useMemo(() => {
    // If a CARTO API key is provided, use high-resolution CARTO Voyager / Dark Matter
    if (cartoApiKey) {
      return {
        key: isDark ? "carto-dark" : "carto-voyager",
        url: isDark
          ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${cartoApiKey}`
          : `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${cartoApiKey}`,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      };
    }

    // Default keyless high-reliability tiles (100% free, zero watermark, no API key needed)
    if (isDark) {
      return {
        key: "esri-dark",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
        attribution:
          '&copy; <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a> &copy; OpenStreetMap contributors',
        subdomains: "abc",
        maxZoom: 16,
      };
    }

    return {
      key: "osm-standard",
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      subdomains: "abc",
      maxZoom: 19,
    };
  }, [isDark, cartoApiKey]);

  useEffect(() => {
    setBaseCoord(initialCoord);
  }, [initialCoord]);

  // Dynamic OpenStreetMap Nominatim Geocoding Fallback
  useEffect(() => {
    let isMounted = true;

    // Check if we already matched locally
    const localMatch = findCoordsFromText(destination);
    if (localMatch) {
      setBaseCoord(localMatch);
      setDetectedLocation(destination);
      return;
    }

    // Clean destination string for geocoding
    const cleanQuery = destination
      .replace(/(\d+[\s-]?day|\bday\b|\btrip\b|\bitinerary\b|\bto\b|\bin\b|\bfor\b|\bgetaway\b|\badventure\b|\btour\b|\bvacation\b)/gi, "")
      .trim();

    if (!cleanQuery) return;

    const cacheKey = `geo_${cleanQuery.toLowerCase()}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const coords = JSON.parse(cached) as [number, number];
        setBaseCoord(coords);
        setDetectedLocation(cleanQuery);
        return;
      } catch (e) {}
    }

    // Query OpenStreetMap Nominatim
    fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanQuery)}&limit=1`,
      { headers: { "Accept-Language": "en" } }
    )
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data && data.length > 0) {
          const coords: [number, number] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
          setBaseCoord(coords);
          setDetectedLocation(data[0].display_name.split(",").slice(0, 2).join(","));
          localStorage.setItem(cacheKey, JSON.stringify(coords));
        }
      })
      .catch((err) => {
        console.warn("Geocoding fetch failed, retained coordinates:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [destination]);

  // Generate geographically distributed pins for activities and stays around destination
  const mapPins = useMemo(() => {
    const pins: Array<{
      id: string;
      title: string;
      day: number;
      coords: [number, number];
      type: "activity" | "stay";
      color: string;
      category: string;
    }> = [];

    itinerary.forEach((dayData, dayIdx) => {
      const dayColor = DAY_COLORS[dayIdx % DAY_COLORS.length];

      // Add activities with real GPS coordinates or calculated offsets
      dayData.activities.forEach((act, actIdx) => {
        let title = "";
        let coords: [number, number];

        if (typeof act === "object" && act !== null) {
          title = act.title || act.name || `Activity ${actIdx + 1}`;
          if (
            act.coordinates &&
            Array.isArray(act.coordinates) &&
            act.coordinates.length === 2 &&
            !isNaN(act.coordinates[0])
          ) {
            coords = [Number(act.coordinates[0]), Number(act.coordinates[1])];
          } else {
            const angle = (dayIdx * 2.2 + actIdx * 1.3) % (2 * Math.PI);
            const radius = 0.015 + ((actIdx + 1) * 0.012) + (dayIdx * 0.005);
            coords = [baseCoord[0] + radius * Math.sin(angle), baseCoord[1] + radius * Math.cos(angle)];
          }
        } else {
          title = String(act);
          const angle = (dayIdx * 2.2 + actIdx * 1.3) % (2 * Math.PI);
          const radius = 0.015 + ((actIdx + 1) * 0.012) + (dayIdx * 0.005);
          coords = [baseCoord[0] + radius * Math.sin(angle), baseCoord[1] + radius * Math.cos(angle)];
        }

        pins.push({
          id: `act-${dayData.day}-${actIdx}`,
          title,
          day: dayData.day,
          coords,
          type: "activity",
          color: dayColor,
          category: `Day ${dayData.day} Activity`,
        });
      });

      // Add primary stay marker with real GPS coordinates or calculated offset
      if (dayData.stay_recommendations && dayData.stay_recommendations.length > 0) {
        const stay = dayData.stay_recommendations[0];
        let stayTitle = "";
        let stayCoords: [number, number];

        if (typeof stay === "object" && stay !== null) {
          stayTitle = stay.name || "Stay";
          if (
            stay.coordinates &&
            Array.isArray(stay.coordinates) &&
            stay.coordinates.length === 2 &&
            !isNaN(stay.coordinates[0])
          ) {
            stayCoords = [Number(stay.coordinates[0]), Number(stay.coordinates[1])];
          } else {
            const stayAngle = (dayIdx * 1.8) % (2 * Math.PI);
            const stayRadius = 0.008 + (dayIdx * 0.003);
            stayCoords = [baseCoord[0] + stayRadius * Math.sin(stayAngle), baseCoord[1] + stayRadius * Math.cos(stayAngle)];
          }
        } else {
          stayTitle = String(stay).split("(")[0].split(":")[0].trim();
          const stayAngle = (dayIdx * 1.8) % (2 * Math.PI);
          const stayRadius = 0.008 + (dayIdx * 0.003);
          stayCoords = [baseCoord[0] + stayRadius * Math.sin(stayAngle), baseCoord[1] + stayRadius * Math.cos(stayAngle)];
        }

        pins.push({
          id: `stay-${dayData.day}`,
          title: stayTitle,
          day: dayData.day,
          coords: stayCoords,
          type: "stay",
          color: "#eab308", // Gold for stay
          category: `Night ${dayData.day} Stay`,
        });
      }
    });

    return pins;
  }, [itinerary, baseCoord]);

  // Filter pins based on selected day
  const filteredPins = useMemo(() => {
    if (selectedDay === "all") return mapPins;
    return mapPins.filter((p) => p.day === selectedDay);
  }, [mapPins, selectedDay]);

  // Path polyline for the selected day
  const routePolyline = useMemo(() => {
    if (selectedDay === "all") return [];
    return filteredPins
      .filter((p) => p.type === "activity")
      .map((p) => p.coords);
  }, [filteredPins, selectedDay]);

  // Accurate day route (backend OSRM when configured) with an instant local fallback
  useEffect(() => {
    const activityPoints = filteredPins
      .filter((p) => p.type === "activity")
      .map((p) => p.coords as [number, number]);

    if (selectedDay === "all" || activityPoints.length < 2) {
      setRouteInfo(null);
      return;
    }

    const local = totalRoute(activityPoints, "drive");
    setRouteInfo({ km: local.km, minutes: local.minutes, provider: "estimate" });

    let cancelled = false;
    api
      .getRoute(activityPoints, "drive")
      .then((result) => {
        if (!cancelled && result?.legs?.length) {
          setRouteInfo({
            km: result.totalKm,
            minutes: result.totalMinutes,
            provider: result.provider,
          });
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [filteredPins, selectedDay]);

  // --- Custom route actions ---
  const handleStartDrawing = () => {
    setEditingRoute(null);
    setDraftPoints([]);
    setDrawing(true);
  };

  const handleCancelDrawing = () => {
    setDrawing(false);
    setDraftPoints([]);
  };

  const handleUndoPoint = () => setDraftPoints((prev) => prev.slice(0, -1));

  const handleFinishDrawing = () => {
    if (draftPoints.length < 2) {
      toast.error("Add at least two points before saving this route.");
      return;
    }
    setEditingRoute(null);
    setRouteEditorOpen(true);
  };

  const handleSaveRoute = async (payload: RouteInput) => {
    if (!tripId) return;

    if (editingRoute) {
      const trip = await api.updateRoute(tripId, editingRoute._id, payload);
      setRoutes(trip.customRoutes || []);
      onUpdated?.(trip);
      toast.success("Route updated");
      return;
    }

    const trip = await api.addRoute(tripId, payload);
    setRoutes(trip.customRoutes || []);
    onUpdated?.(trip);
    toast.success("Route saved");
    setDrawing(false);
    setDraftPoints([]);
  };

  const handleDeleteRoute = async (route: CustomRoute) => {
    if (!tripId) return;
    try {
      setBusyRouteId(route._id);
      const trip = await api.deleteRoute(tripId, route._id);
      setRoutes(trip.customRoutes || []);
      onUpdated?.(trip);
      toast.success("Route removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the route.");
    } finally {
      setBusyRouteId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Map Filter & Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-3xl bg-card border border-border/70 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
            <Navigation className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-foreground">Interactive Itinerary Map</h4>
              {detectedLocation && (
                <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                  <MapPin className="w-3 h-3 mr-1" />
                  {detectedLocation}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Explore day routes, stay locations, and scenic spots around your destination
            </p>
            {routeInfo && (
              <div className="flex items-center gap-1.5 mt-1 text-[11px] font-bold text-primary">
                <Car className="w-3.5 h-3.5" />
                <span>
                  {formatDistance(routeInfo.km)} · ~{formatDuration(routeInfo.minutes)} drive
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  ({routeInfo.provider})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Day Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <Button
            type="button"
            size="sm"
            variant={selectedDay === "all" ? "hero" : "outline"}
            onClick={() => setSelectedDay("all")}
            className="rounded-xl text-xs h-8 px-3 font-semibold"
          >
            All Pins ({mapPins.length})
          </Button>
          {itinerary.map((d) => {
            const weather = weatherByDay?.[d.day];
            return (
              <Button
                key={d.day}
                type="button"
                size="sm"
                variant={selectedDay === d.day ? "hero" : "outline"}
                onClick={() => setSelectedDay(d.day)}
                className="rounded-xl text-xs h-8 px-2.5 font-semibold"
              >
                <span>Day {d.day}</span>
                {weather && weather.riskLevel !== "none" && (
                  <span
                    title={`Weather risk: ${riskMeta(weather.riskLevel).label}\n${weather.advisories.join("\n")}`}
                    className={`w-1.5 h-1.5 rounded-full ${riskMeta(weather.riskLevel).dotClass}`}
                  />
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Custom Route Drawing Controls (Milestone 4) */}
      {canEdit && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl bg-primary/5 border border-primary/20">
          <div className="flex items-center gap-2 text-xs">
            <RouteIcon className="w-4 h-4 text-primary shrink-0" />
            {drawing ? (
              <span className="font-semibold text-foreground">
                Click the map to add points · {draftPoints.length} placed
                {draftDistanceKm > 0 && (
                  <span className="text-muted-foreground"> · {formatDistance(draftDistanceKm)}</span>
                )}
              </span>
            ) : (
              <span className="font-semibold text-foreground">
                Draw your own routes — detours, treks or alternate drives
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {drawing ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleUndoPoint}
                  disabled={draftPoints.length === 0}
                  className="rounded-xl text-xs h-8 px-2.5 font-semibold gap-1.5"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Undo</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="hero"
                  onClick={handleFinishDrawing}
                  disabled={draftPoints.length < 2}
                  className="rounded-xl text-xs h-8 px-2.5 font-semibold gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Finish</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelDrawing}
                  className="rounded-xl text-xs h-8 px-2.5 font-semibold gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </Button>
              </>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="hero"
                onClick={handleStartDrawing}
                className="rounded-xl text-xs h-8 px-3 font-semibold gap-1.5"
              >
                <RouteIcon className="w-3.5 h-3.5" />
                <span>Draw Route</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Map Viewport Container */}
      <div
        className={`relative w-full h-[450px] sm:h-[520px] rounded-3xl overflow-hidden border border-border/70 shadow-card z-0 ${
          drawing ? "[&_.leaflet-container]:!cursor-crosshair" : ""
        }`}
      >
        <MapContainer
          center={baseCoord}
          zoom={12}
          scrollWheelZoom={false}
          className="w-full h-full"
        >
          <TileLayer
            key={tileConfig.key}
            attribution={tileConfig.attribution}
            url={tileConfig.url}
            subdomains={tileConfig.subdomains}
            maxZoom={tileConfig.maxZoom}
          />

          <MapViewUpdater center={baseCoord} zoom={selectedDay === "all" ? 11 : 12} />

          <DrawClickHandler
            active={drawing}
            onAddPoint={(point) => setDraftPoints((prev) => [...prev, point])}
          />

          {/* Saved user-drawn routes */}
          {routes.map((route) => (
            <Polyline
              key={route._id}
              positions={route.points}
              pathOptions={{ color: route.color, weight: 4, opacity: 0.9 }}
            />
          ))}

          {/* In-progress draft route */}
          {draftPoints.length > 0 && (
            <>
              {draftPoints.length >= 2 && (
                <Polyline
                  positions={draftPoints}
                  pathOptions={{ color: "#f97316", weight: 3, dashArray: "4, 6", opacity: 0.95 }}
                />
              )}
              {draftPoints.map((point, index) => (
                <CircleMarker
                  key={`draft-${index}`}
                  center={point}
                  radius={index === 0 ? 7 : 5}
                  pathOptions={{
                    color: "#ffffff",
                    weight: 2,
                    fillColor: "#f97316",
                    fillOpacity: 1,
                  }}
                />
              ))}
            </>
          )}

          {/* Render Activity Connecting Route */}
          {routePolyline.length > 1 && (
            <Polyline
              positions={routePolyline}
              pathOptions={{
                color:
                  selectedDay !== "all"
                    ? DAY_COLORS[(selectedDay - 1) % DAY_COLORS.length]
                    : "#38bdf8",
                weight: 4,
                dashArray: "6, 6",
                opacity: 0.85,
              }}
            />
          )}

          {/* Render Markers */}
          {filteredPins.map((pin) => {
            const isStay = pin.type === "stay";
            const icon = createCustomPin(
              isStay ? "H" : `D${pin.day}`,
              pin.color,
              isStay
            );

            return (
              <Marker key={pin.id} position={pin.coords} icon={icon}>
                <Popup className="custom-popup">
                  <div className="p-1 space-y-1 text-left min-w-[180px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                        {pin.category}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-bold">
                        Day {pin.day}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-foreground leading-snug">
                      {pin.title}
                    </p>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Nearby search results (Milestone 4.5) */}
          {(nearbyPlaces || []).map((place) => (
            <CircleMarker
              key={place.id}
              center={place.coordinates}
              radius={6}
              pathOptions={{
                color: "#b45309",
                weight: 2,
                fillColor: "#f59e0b",
                fillOpacity: 0.85,
              }}
            >
              <Popup className="custom-popup">
                <div className="p-1 space-y-1 text-left min-w-[180px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                      {place.category}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-bold">
                      {formatDistance(place.distanceKm)}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-foreground leading-snug">{place.name}</p>
                  {place.tags?.address && (
                    <p className="text-[11px] text-muted-foreground">{place.tags.address}</p>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        {/* Floating Legend */}
        <div className="absolute bottom-4 left-4 z-[400] p-3 rounded-2xl bg-card/90 backdrop-blur-md border border-border/70 shadow-md text-[11px] space-y-1.5 hidden sm:block">
          <div className="font-bold text-foreground flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-primary" />
            <span>Map Legend</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full bg-primary" />
            <span>Activities (Numbered by Day)</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
            <span>Recommended Night Stays</span>
          </div>
          {routes.length > 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="w-4 h-0.5 rounded-full bg-sky-500" />
              <span>Your Custom Routes</span>
            </div>
          )}
          {(nearbyPlaces || []).length > 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>Nearby Places ({nearbyPlaces!.length})</span>
            </div>
          )}
        </div>
      </div>

      {/* Saved Custom Routes List */}
      {routes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <RouteIcon className="w-4 h-4 text-primary" />
            <span>Your Routes ({routes.length})</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {routes.map((route) => (
              <div
                key={route._id}
                className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-border/60 bg-card/60"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: route.color }}
                  />
                  <RouteModeIcon mode={route.mode} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{route.name}</p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-muted-foreground font-semibold">
                        {formatDistance(route.distanceKm)}
                      </span>
                      {route.day != null && (
                        <Badge variant="secondary" className="text-[10px] px-2 py-0">
                          Day {route.day}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="Edit route"
                      className="h-7 w-7 text-muted-foreground hover:text-primary rounded-lg"
                      onClick={() => {
                        setEditingRoute(route);
                        setRouteEditorOpen(true);
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      title="Delete route"
                      disabled={busyRouteId === route._id}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-lg"
                      onClick={() => handleDeleteRoute(route)}
                    >
                      {busyRouteId === route._id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {canEdit && (
        <RouteEditor
          open={routeEditorOpen}
          onOpenChange={setRouteEditorOpen}
          route={editingRoute}
          draftPoints={editingRoute ? null : draftPoints}
          days={itinerary.length}
          onSave={handleSaveRoute}
        />
      )}
    </div>
  );
};
export default TripMap;
