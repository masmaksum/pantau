import type { Event, SourceStatus } from "../shared/types.js";
import type {
  OfficialSocialPost,
  OfficialSocialProvider,
  OfficialSocialState,
} from "../shared/social.js";
import { applyTopicPolicy, isAllowedReport } from "../shared/topic-policy.js";
import { classify, idFor, safeUrl, textOnly } from "./domain.js";

export type SocialEnvironment = Readonly<Record<string, string | undefined>>;

const registry: readonly OfficialSocialProvider[] = [
  {
    platform: "x",
    name: "X",
    product: "X API v2 · Recent Search",
    method: "GET",
    endpointTemplate: "https://api.x.com/2/tweets/search/recent",
    documentation: "https://docs.x.com/x-api/posts/search-recent-posts",
    scope: "Pencarian unggahan publik sesuai query dan hak akses paket API.",
    accessRequirements: [
      "Developer app dan paket/kuota yang mengizinkan recent search",
      "Bearer token aplikasi; belum ada validasi token atau akses live",
    ],
    credentialVariables: ["X_BEARER_TOKEN"],
    targetVariables: ["X_SEARCH_QUERY"],
  },
  {
    platform: "threads",
    name: "Threads",
    product: "Threads API · Keyword Search",
    method: "GET",
    endpointTemplate: "Meta Threads API /keyword_search",
    documentation:
      "https://www.postman.com/meta/threads/request/34203612-b3b2c12a-7ce6-4d86-a3c6-6d31e3b66ea1",
    scope:
      "Pencarian kata kunci sesuai izin Threads; hasil publik memerlukan akses yang disetujui.",
    accessRequirements: [
      "Meta app dengan Threads API",
      "OAuth Threads; threads_basic dan akses threads_keyword_search sesuai review yang berlaku",
    ],
    credentialVariables: ["THREADS_ACCESS_TOKEN"],
    targetVariables: ["THREADS_SEARCH_QUERY"],
  },
  {
    platform: "instagram",
    name: "Instagram",
    product: "Instagram API with Facebook Login · Professional Media",
    method: "GET",
    endpointTemplate: "https://graph.facebook.com/{version}/{ig-user-id}/media",
    documentation:
      "https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api",
    scope:
      "Media akun profesional yang memberi izin. Hashtag Search/Business Discovery merupakan perluasan terpisah sesuai izin, belum disiapkan sebagai pencarian bebas.",
    accessRequirements: [
      "Akun profesional dan hubungan Facebook Page yang sesuai alur Facebook Login",
      "OAuth dan permission baca Instagram yang berlaku; App Review bila diperlukan",
      "Versi Graph API ditetapkan saat implementasi",
    ],
    credentialVariables: ["INSTAGRAM_ACCESS_TOKEN"],
    targetVariables: ["INSTAGRAM_USER_ID", "META_GRAPH_VERSION"],
  },
  {
    platform: "facebook",
    name: "Facebook",
    product: "Facebook Pages API · Page Posts",
    method: "GET",
    endpointTemplate: "https://graph.facebook.com/{version}/{page-id}/posts",
    documentation: "https://developers.facebook.com/docs/pages-api/posts/",
    scope:
      "Unggahan Page yang diberi akses. Bukan pencarian seluruh profil atau grup Facebook.",
    accessRequirements: [
      "Facebook Page dan Page access token yang sesuai",
      "pages_read_engagement dan izin/review lain sesuai Page dan data yang diakses",
      "Akses Page pihak lain atau riset publik luas tidak otomatis tersedia",
    ],
    credentialVariables: ["FACEBOOK_PAGE_ACCESS_TOKEN"],
    targetVariables: ["FACEBOOK_PAGE_ID", "META_GRAPH_VERSION"],
  },
  {
    platform: "tiktok",
    name: "TikTok",
    product: "TikTok Display API · Authorized User Videos",
    method: "POST",
    endpointTemplate: "https://open.tiktokapis.com/v2/video/list/",
    documentation:
      "https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list",
    scope:
      "Video publik pengguna yang memberi izin melalui Login Kit; bukan pencarian kata kunci seluruh TikTok.",
    accessRequirements: [
      "TikTok developer app dengan Login Kit dan Display API yang disetujui",
      "OAuth pengguna dan scope video.list",
      "Research API adalah jalur terpisah dengan persyaratan kelayakan; tidak diaktifkan secara implisit",
    ],
    credentialVariables: ["TIKTOK_ACCESS_TOKEN"],
    targetVariables: [],
  },
];

/** Presence is not validation. This function never returns values or contacts any API. */
export function officialSocialStates(
  env: SocialEnvironment = {},
): OfficialSocialState[] {
  const present = (name: string) => !!env[name]?.trim();
  return registry.map((provider) => {
    const missingVariables = [
      ...provider.credentialVariables,
      ...provider.targetVariables,
    ].filter((name) => !present(name));
    return {
      ...provider,
      enabled: false,
      collectorImplemented: false,
      credentialsPresent: provider.credentialVariables.every(present),
      missingVariables,
      stage: missingVariables.length
        ? "configuration_missing"
        : "implementation_pending",
      message: missingVariables.length
        ? "Jalur resmi disiapkan; konfigurasi belum lengkap dan pengambilan data belum diaktifkan."
        : "Variabel terisi, belum divalidasi. Collector, OAuth, izin, dan aktivasi akan dikerjakan pada tahap implementasi.",
    };
  });
}

/** Deliberately dormant: even supplied credentials cannot start collection in this version. */
export async function collectOfficialSocial(
  env: SocialEnvironment = {},
): Promise<{
  events: Event[];
  providers: OfficialSocialState[];
  sources: SourceStatus[];
}> {
  const providers = officialSocialStates(env);
  return {
    events: [],
    providers,
    sources: providers.map((p) => ({
      id: `social-${p.platform}`,
      name: `${p.name} · API resmi`,
      url: p.documentation,
      status: "unconfigured",
      fetchedAt: null,
      attemptedAt: new Date().toISOString(),
      count: 0,
      message: p.message,
    })),
  };
}

const platformHosts: Record<OfficialSocialPost["platform"], string[]> = {
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
  threads: ["threads.com", "www.threads.com", "threads.net", "www.threads.net"],
  instagram: ["instagram.com", "www.instagram.com"],
  facebook: ["facebook.com", "www.facebook.com", "m.facebook.com"],
  tiktok: ["tiktok.com", "www.tiktok.com"],
};

/** Integration seam for a future official collector; not a public ingestion endpoint. */
export function normalizeOfficialSocialPost(
  post: OfficialSocialPost,
): Event | null {
  const definition = registry.find((p) => p.platform === post.platform);
  const url = safeUrl(post.url);
  const timestamp = Date.parse(post.publishedAt);
  const text = textOnly(post.text).slice(0, 600);
  if (
    !definition ||
    typeof post.id !== "string" ||
    !post.id.trim() ||
    !url ||
    !url.startsWith("https://") ||
    !Number.isFinite(timestamp) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(
      post.publishedAt,
    ) ||
    !text
  )
    return null;
  if (!platformHosts[post.platform].includes(new URL(url).hostname))
    return null;
  const event: Event = applyTopicPolicy({
    id: idFor(`official:${post.platform}:${post.id}`),
    title: text.slice(0, 200),
    summary: text.slice(0, 600),
    url,
    source: definition.name,
    category: classify(text),
    publishedAt: new Date(timestamp).toISOString(),
    observedAt: new Date().toISOString(),
    location: null,
    verification: "reported",
  });
  return isAllowedReport(event) ? event : null;
}
