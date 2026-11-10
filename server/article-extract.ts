import { load, type CheerioAPI } from "cheerio";
import { CaptureError } from "./article-fetch.js";

export interface ExtractedPhoto {
  sourceUrl: string;
  caption: string | null;
  alt: string | null;
}
export interface ExtractedArticle {
  title: string;
  byline: string | null;
  text: string;
  photos: ExtractedPhoto[];
  nextPage: string | null;
  warnings: string[];
}
const clean = (s: string) =>
  s
    .replace(/[\t\r ]+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
const absolute = (s: string, base: string) => {
  try {
    return new URL(s, base).href;
  } catch {
    return s;
  }
};
function bodyText($: CheerioAPI, selector: string) {
  const body = $(selector).first().clone();
  const cards = body.find("section.multi-card[data-page]").clone();
  if (cards.length) body.empty().append(cards);
  body
    .find(
      'script,style,noscript,iframe,form,nav,aside,button,ins,figure,figcaption,[hidden],[aria-hidden="true"],.noncontent,.adsbygoogle,.parallaxindetail,.staticdetail_container,.baca-juga,.lihat-juga,.related,.detail__body-tag,.detail__anchor,.pagination,.paging,.pic_artikel_sisip',
    )
    .remove();
  body.find("br").replaceWith("\n");
  body.find("p,h2,h3,h4,li,blockquote,section,div").each((_i, node) => {
    $(node).append("\n\n");
  });
  return body
    .text()
    .split(/\n\s*\n/)
    .map(clean)
    .filter(
      (s) =>
        s &&
        !/^(ADVERTISEMENT|SCROLL TO CONTINUE WITH CONTENT|Baca juga:|Baca Juga:|Simak Video|Pewarta:|Editor:|Copyright ©)/.test(
          s,
        ),
    )
    .join("\n\n");
}
export function extractArticle(
  html: string,
  url: string,
  sourceId: string,
): ExtractedArticle {
  const $ = load(html);
  if (
    $('[itemprop="isAccessibleForFree"][content="false"]').length ||
    /"isAccessibleForFree"\s*:\s*(?:false|"false")/.test(
      $('script[type="application/ld+json"]').text(),
    )
  )
    throw new CaptureError("Halaman membatasi akses artikel", true);
  const selectors: Record<
    string,
    { body: string; photos: string; title: string; author: string }
  > = {
    antara: {
      body: ".post-content",
      photos: ".wrap__article-detail-image img,.post-content img",
      title: ".wrap__article-detail-title h1",
      author: 'meta[name="author"]',
    },
    detik: {
      body: ".detail__body-text",
      photos: ".detail__media img,.detail__body-text img",
      title: ".detail__title",
      author: ".detail__author",
    },
  };
  const config = selectors[sourceId];
  if (!config) throw new CaptureError("Extractor kanal belum tersedia", true);
  const warnings: string[] = [];
  const text = bodyText($, config.body);
  if (text.length < 120)
    warnings.push(
      "Teks utama tidak ditemukan atau terlalu pendek; periksa HTML tersimpan",
    );
  const photos: ExtractedPhoto[] = [];
  $(config.photos).each((_i, img) => {
    const node = $(img);
    if (node.parents(".noncontent,.related,.adsbygoogle").length) return;
    const srcset = node.attr("data-srcset") || node.attr("srcset");
    const largest = srcset
      ?.split(",")
      .map((x) => x.trim().split(/\s+/))
      .sort((a, b) => parseInt(b[1] || "0") - parseInt(a[1] || "0"))[0]?.[0];
    const src =
      node.attr("data-src") ||
      node.attr("data-original") ||
      largest ||
      node.attr("src");
    if (!src || src.startsWith("data:")) return;
    if (
      /\/(?:loading|spinner|pixel|spacer|blank)\.(?:gif|png|svg)(?:\?|$)/i.test(
        src,
      ) ||
      /^loading\.{0,3}$/i.test(node.attr("alt") || "")
    )
      return;
    const sourceUrl = absolute(src, url);
    if (photos.some((p) => p.sourceUrl === sourceUrl)) return;
    const figure = node.closest("figure");
    const caption = clean(
      (figure.length
        ? figure.find("figcaption")
        : node
            .closest(".wrap__article-detail-image,.detail__media")
            .find("figcaption")
      )
        .first()
        .text() ||
        node.closest(".pic_artikel_sisip").find(".pic > span").first().text(),
    );
    photos.push({
      sourceUrl,
      caption: caption || null,
      alt: clean(node.attr("alt") || "") || null,
    });
  });
  // Follow only publisher pagination for this article, never related-story links.
  const next = $('a[rel="next"],a.detail__anchor-next').first().attr("href");
  let nextPage: string | null = null;
  if (next) {
    const candidate = new URL(next, url),
      current = new URL(url);
    if (
      candidate.origin === current.origin &&
      candidate.pathname.replace(/\/\d+\/?$/, "") ===
        current.pathname.replace(/\/\d+\/?$/, "")
    )
      nextPage = candidate.href;
    else warnings.push("Tautan lanjutan di luar artikel tidak diikuti");
  }
  const title = clean(
    $(config.title).first().text() ||
      $('meta[property="og:title"]').attr("content") ||
      $("title").text(),
  );
  const author = $(config.author).first();
  return {
    title,
    byline: clean(author.attr("content") || author.text()) || null,
    text,
    photos,
    nextPage,
    warnings,
  };
}
