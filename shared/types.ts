import type { HumanRightsCategory } from "./human-rights.js";
export type Category =
  | HumanRightsCategory
  | "gempa"
  | "banjir"
  | "kebakaran"
  | "demo"
  | "kriminal"
  | "politik"
  | "transportasi"
  | "lainnya";
export type Precision = "epicenter" | "satellite-pixel" | "city" | "province";
export interface Location {
  name: string;
  lat: number;
  lon: number;
  precision: Precision;
  method: "official" | "satellite" | "headline-match";
}
export interface Event {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  category: Category;
  publishedAt: string | null;
  observedAt: string;
  location: Location | null;
  verification: "official" | "reported" | "sensor";
  magnitude?: number;
  depth?: string;
  confidence?: string;
  topicHints?: string[];
}
export interface SourceStatus {
  id: string;
  name: string;
  url: string;
  status: "ok" | "stale" | "error" | "unconfigured";
  fetchedAt: string | null;
  attemptedAt: string;
  count: number;
  message?: string;
}
export interface Snapshot {
  generatedAt: string;
  events: Event[];
  sources: SourceStatus[];
  archive?: {
    status: "ok" | "error";
    articles: number;
    revisions: number;
    message?: string;
  };
}
export interface Weather {
  city: string;
  latitude: number;
  longitude: number;
  time: string;
  fetchedAt: string;
  temperature: number;
  precipitation: number;
  wind: number;
  code: number;
  daily: { date: string; min: number; max: number; rain: number }[];
}
export interface Camera {
  id: string;
  name: string;
  region: string;
  url: string;
  sourceUrl: string;
  type: "hls" | "link";
}
