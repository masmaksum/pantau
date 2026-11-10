export interface Dataset {
  id: string;
  name: string;
  provider: string;
  url: string;
  license: string;
  vintage: string;
  kind: "raster" | "vector" | "model" | "aggregate" | "reference";
  access: "ready" | "key" | "file" | "reference" | "excluded";
  note: string;
}

// Factual inventory researched from Mandum Rimba, then verified against primary providers.
// Adapter implementations are independent; no Mandum Rimba software/data is bundled.
export const datasets: Dataset[] = [
  {
    id: "forest-loss",
    name: "Kehilangan tutupan pohon",
    provider: "Hansen / UMD · Global Forest Watch",
    url: "https://www.globalforestwatch.org/",
    license: "CC BY 4.0",
    vintage: "v1.13 · 2001–2025 · 30 m",
    kind: "raster",
    access: "ready",
    note: "Kehilangan tutupan pohon bukan otomatis deforestasi. Ambang kanopi 30%; ubin GFW dirender langsung penyedia.",
  },
  {
    id: "nasa-imagery",
    name: "Citra satelit harian",
    provider: "NASA EOSDIS GIBS · MODIS Terra",
    url: "https://worldview.earthdata.nasa.gov/",
    license: "NASA open data; atribusi produk",
    vintage: "Harian · tanggal akuisisi UTC",
    kind: "raster",
    access: "ready",
    note: "Warna asli; awan atau data kosong dapat menutupi daratan. Bukan citra real-time.",
  },
  {
    id: "nasa-hotspots",
    name: "Hotspot arsip harian",
    provider: "NASA GIBS / FIRMS · VIIRS NOAA-20",
    url: "https://firms.modaps.eosdis.nasa.gov/",
    license: "NASA open data; atribusi produk",
    vintage: "Harian · VIIRS 375 m",
    kind: "raster",
    access: "ready",
    note: "Deteksi termal sebagai gambar WMS; tidak dapat diklik/dihitung. Bukan konfirmasi kebakaran atau luas terbakar.",
  },
  {
    id: "cams-air",
    name: "Kualitas udara · PM2.5 / PM10",
    provider: "Copernicus CAMS · Open-Meteo",
    url: "https://open-meteo.com/en/docs/air-quality-api",
    license: "CC BY 4.0; atribusi CAMS & Open-Meteo; ketentuan API berlaku",
    vintage: "Model per jam · grid global sekitar 45 km",
    kind: "model",
    access: "ready",
    note: "Sampel model dekat kota pilihan, bukan sensor di darat. AQI berasal dari Open-Meteo, bukan perhitungan EPA/ISPU PANTAU.",
  },
  {
    id: "gbif",
    name: "Biodiversitas · catatan keberadaan",
    provider: "GBIF · interpretasi kategori IUCN oleh GBIF",
    url: "https://www.gbif.org/occurrence/search?country=ID",
    license: "Per dataset: CC0 / CC BY / CC BY-NC",
    vintage: "Catatan bertahun 1990–tahun berjalan · Indonesia",
    kind: "aggregate",
    access: "ready",
    note: "Jumlah catatan, bukan jumlah spesies/populasi. Bias survei dan duplikasi mungkin terjadi. Tidak menerbitkan koordinat satwa.",
  },
  {
    id: "oil-palm",
    name: "Konteks lahan · konsesi sawit",
    provider: "Global Forest Watch · data turunan Greenpeace",
    url: "https://data-api.globalforestwatch.org/dataset/gfw_oil_palm/v2025",
    license: "CC BY 4.0",
    vintage: "v2025",
    kind: "vector",
    access: "key",
    note: "Snapshot batas konsesi, bukan status izin terkini atau bukti pelanggaran. Konteks ekologi, bukan laporan ekonomi.",
  },
  {
    id: "pulpwood",
    name: "Konteks lahan · HTI / pulp",
    provider: "Global Forest Watch",
    url: "https://data-api.globalforestwatch.org/dataset/gfw_wood_fiber/v2025",
    license: "CC BY 4.0",
    vintage: "v2025",
    kind: "vector",
    access: "key",
    note: "Batas lahan historis; tidak menyimpulkan sebab kejadian atau pelanggaran.",
  },
  {
    id: "logging",
    name: "Konteks lahan · logging",
    provider: "Global Forest Watch",
    url: "https://data-api.globalforestwatch.org/dataset/gfw_logging/v202106",
    license: "CC BY 4.0",
    vintage: "v202106",
    kind: "vector",
    access: "key",
    note: "Snapshot 2021, bukan penetapan hukum saat ini.",
  },
  {
    id: "mining-footprint",
    name: "Jejak fisik lahan tambang",
    provider: "Maus et al. 2022 · PANGAEA / GFW",
    url: "https://doi.org/10.1594/PANGAEA.942325",
    license: "CC BY 4.0",
    vintage: "v2 · 2022",
    kind: "vector",
    access: "key",
    note: "Jejak lahan dari satelit, bukan batas izin IUP. Ditampilkan hanya sebagai konteks perubahan bentang alam.",
  },
  {
    id: "moratorium",
    name: "Moratorium hutan · PIPPIB",
    provider: "KLHK via Global Forest Watch",
    url: "https://data-api.globalforestwatch.org/dataset/idn_forest_moratorium/v20200923",
    license: "CC BY 4.0 menurut katalog sumber; verifikasi penggunaan",
    vintage: "v20200923",
    kind: "vector",
    access: "key",
    note: "Versi historis 2020. Bukan pernyataan moratorium terbaru.",
  },
  {
    id: "mangrove",
    name: "Sebaran mangrove",
    provider: "Global Mangrove Watch",
    url: "https://www.globalmangrovewatch.org/",
    license: "CC BY 4.0",
    vintage: "GMW v3 · ekstent 2020 (sesuaikan berkas)",
    kind: "vector",
    access: "file",
    note: "Perlu GeoJSON terverifikasi milik operator; tidak menyalin dataset turunan Mandum Rimba.",
  },
  {
    id: "peatland",
    name: "Sebaran gambut",
    provider: "Wetlands International / GFW atau KLHK KHG",
    url: "https://data.globalforestwatch.org/datasets/d52e0e67ad21401cbf3a2c002599cf58_10",
    license: "Bergantung dataset yang diimpor",
    vintage: "Peta GFW 2003–2006; KHG berbeda sumber",
    kind: "vector",
    access: "file",
    note: "Perlu GeoJSON dan metadata operator. Gambut dan Kesatuan Hidrologis Gambut tidak dianggap dataset yang sama.",
  },
  {
    id: "bnpb-history",
    name: "Bencana historis · banjir / longsor",
    provider: "BNPB DIBI via UNDRR DesInventar",
    url: "https://www.desinventar.net/DesInventar/profiletab.jsp?countrycode=idn",
    license: "Sumber publik; verifikasi ketentuan ekspor sebelum redistribusi",
    vintage: "Arsip; tanggal per record wajib",
    kind: "vector",
    access: "file",
    note: "Perlu GeoJSON hasil ETL operator. Arsip XML sumber sangat besar; tidak diunduh pada request pengunjung. Tidak dicampur feed 24 jam.",
  },
  {
    id: "hydrobasins",
    name: "Daerah aliran sungai",
    provider: "HydroSHEDS · HydroBASINS",
    url: "https://www.hydrosheds.org/products/hydrobasins",
    license: "Ketentuan HydroSHEDS; atribusi versi impor",
    vintage: "Versi dan level DAS dari berkas operator",
    kind: "vector",
    access: "file",
    note: "Konteks hulu-hilir. Kedekatan atau irisan lokasi tidak membuktikan hubungan sebab-akibat.",
  },
  {
    id: "wdpa",
    name: "Kawasan lindung",
    provider: "Protected Planet · UNEP-WCMC / IUCN",
    url: "https://www.protectedplanet.net/",
    license:
      "Pembatasan nonkomersial / redistribusi; periksa ketentuan terbaru",
    vintage: "Katalog Mandum: WDPA v202512",
    kind: "reference",
    access: "reference",
    note: "Tautan referensi. Tidak dibundel, diekspor, atau diproksikan karena hak penggunaannya belum dikonfirmasi untuk instans ini.",
  },
  {
    id: "worldcover",
    name: "Tutupan habitat",
    provider: "ESA WorldCover",
    url: "https://esa-worldcover.org/en",
    license: "CC BY 4.0",
    vintage: "2021 · resolusi 10 m",
    kind: "reference",
    access: "reference",
    note: "Referensi dataset; belum ada pipeline raster pada PANTAU. Tidak mengklaim sudah menghitung habitat atau risiko.",
  },
  {
    id: "gadm",
    name: "Batas administratif",
    provider: "GADM",
    url: "https://gadm.org/",
    license: "Nonkomersial; syarat khusus untuk redistribusi",
    vintage: "v4.1 dalam Mandum Rimba",
    kind: "reference",
    access: "reference",
    note: "Tidak menyalin batas GADM. Gazetteer PANTAU tetap sederhana dan terpisah dari batas resmi.",
  },
  {
    id: "natural-earth",
    name: "Referensi perkotaan",
    provider: "Natural Earth",
    url: "https://www.naturalearthdata.com/",
    license: "Public domain",
    vintage: "Bergantung rilis",
    kind: "reference",
    access: "reference",
    note: "Dipakai Mandum untuk menyaring bias perkotaan; belum diterapkan pada statistik nasional GBIF PANTAU.",
  },
  {
    id: "iucn-ranges",
    name: "Poligon sebaran resmi spesies",
    provider: "IUCN Red List",
    url: "https://www.iucnredlist.org/resources/spatial-data-download",
    license: "Registrasi / perjanjian; redistribusi terbatas",
    vintage: "Bergantung rilis",
    kind: "reference",
    access: "reference",
    note: "Tidak diimpor. Kategori ancaman dalam statistik berasal dari interpretasi GBIF, bukan poligon resmi IUCN.",
  },
  {
    id: "trase",
    name: "Rantai pasok komoditas",
    provider: "Trase",
    url: "https://trase.earth/",
    license: "Per dataset",
    vintage: "Bergantung rilis",
    kind: "reference",
    access: "excluded",
    note: "Tidak diintegrasikan karena topik ekonomi dikecualikan oleh kebijakan PANTAU.",
  },
];

export interface AirQuality {
  city: string;
  latitude: number;
  longitude: number;
  time: string;
  pm25: number | null;
  pm10: number | null;
  usAqi: number | null;
  hourly: { time: string; pm25: number | null }[];
}
export interface Biodiversity {
  scope: string;
  startYear: number;
  endYear: number;
  records: number;
  threatCounts: { code: string; count: number }[];
}
export interface ContextFeature {
  type: "Feature";
  id?: string | number;
  geometry: { type: "Point" | "Polygon" | "MultiPolygon"; coordinates: any };
  properties: Record<string, string | number | null>;
}
export interface ContextCollection {
  type: "FeatureCollection";
  features: ContextFeature[];
  truncated: boolean;
  rejected: number;
}

export const gfwVectors: Record<
  string,
  { dataset: string; version: string; where: string }
> = {
  "oil-palm": {
    dataset: "gfw_oil_palm",
    version: "v2025",
    where: "iso3='IDN'",
  },
  pulpwood: {
    dataset: "gfw_wood_fiber",
    version: "v2025",
    where: "iso3='IDN'",
  },
  logging: {
    dataset: "gfw_logging",
    version: "v202106",
    where: "country='IDN'",
  },
  "mining-footprint": {
    dataset: "pangaea_global_mining",
    version: "v2",
    where: "iso3_code='IDN'",
  },
  moratorium: {
    dataset: "idn_forest_moratorium",
    version: "v20200923",
    where: "",
  },
};
export const fileLayerIds = [
  "mangrove",
  "peatland",
  "bnpb-history",
  "hydrobasins",
];

export function validSatelliteDate(value: string, now = Date.now()): boolean {
  const t = Date.parse(value + "T00:00:00Z");
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(t) &&
    new Date(t).toISOString().slice(0, 10) === value &&
    value >= "2018-01-01" &&
    t <= now - 86_400_000
  );
}
export function forestTileUrl(endYear: number): string {
  if (!Number.isInteger(endYear) || endYear < 2001 || endYear > 2025)
    throw new Error("Invalid loss year");
  return `https://tiles.globalforestwatch.org/umd_tree_cover_loss/v1.13/dynamic/{z}/{x}/{y}.png?render_type=true_color&start_year=2001&end_year=${endYear}&tree_cover_density_threshold=30`;
}
