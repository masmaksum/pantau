import type { Event, Snapshot } from "./types.js";
import { applyTopicPolicy, isAllowedReport } from "./topic-policy.js";
export interface ReportFilter {
  hours: number;
  category?: string;
  region?: string;
  source?: string;
  search?: string;
  located?: boolean;
}
export function filterReports(
  events: Event[],
  filter: ReportFilter,
  now = Date.now(),
) {
  const search = (filter.search ?? "").trim().toLocaleLowerCase("id");
  return events
    .map(applyTopicPolicy)
    .filter(isAllowedReport)
    .filter((e) => {
      const published = Date.parse(e.publishedAt ?? "");
      return (
        Number.isFinite(published) &&
        published >= now - filter.hours * 3_600_000 &&
        published <= now + 300_000 &&
        (!filter.category ||
          filter.category === "all" ||
          e.category === filter.category) &&
        (!filter.region ||
          filter.region === "all" ||
          e.location?.name === filter.region) &&
        (!filter.source ||
          filter.source === "all" ||
          e.source === filter.source) &&
        (!filter.located || !!e.location) &&
        `${e.title} ${e.summary} ${e.source} ${e.location?.name ?? ""}`
          .toLocaleLowerCase("id")
          .includes(search)
      );
    });
}
export function newsSources(snapshot: Snapshot) {
  return snapshot.sources.filter(
    (s) => !s.id.startsWith("social-") && !["bmkg", "firms"].includes(s.id),
  );
}
export function newsReports(snapshot: Snapshot) {
  const names = new Set(newsSources(snapshot).map((s) => s.name));
  return snapshot.events.filter(
    (e) => e.verification === "reported" && names.has(e.source),
  );
}
