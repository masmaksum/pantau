export type View = "peta" | "berita" | "medsos";
export type NewsTab = "terkini" | "arsip";
export function readRoute(hash: string): { view: View; news: NewsTab } {
  if (hash === "#berita/arsip") return { view: "berita", news: "arsip" };
  if (hash === "#berita") return { view: "berita", news: "terkini" };
  if (hash === "#medsos") return { view: "medsos", news: "terkini" };
  return { view: "peta", news: "terkini" };
}
export function mountNavigation(
  changed: (view: View, news: NewsTab) => void,
  root: Document = document,
  browser: Window = window,
) {
  let lastRoute: string | undefined;
  function sync() {
    const route = readRoute(browser.location.hash);
    const key = `${route.view}/${route.news}`;
    root.title = `${route.view === "peta" ? "Peta & Ringkasan" : route.view === "berita" ? "Kanal Berita" : "Kanal Medsos"} · PANTAU`;
    root.querySelectorAll<HTMLElement>("[data-view-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.viewPanel !== route.view;
    });
    root.querySelectorAll<HTMLAnchorElement>("[data-view]").forEach((link) => {
      if (link.dataset.view === route.view)
        link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    root
      .querySelectorAll<HTMLButtonElement>("[data-news-tab]")
      .forEach((button) => {
        const active = button.dataset.newsTab === route.news;
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
      });
    root.getElementById("news-live")!.hidden = route.news !== "terkini";
    root.getElementById("news-archive")!.hidden = route.news !== "arsip";
    if (lastRoute !== undefined && lastRoute !== key) browser.scrollTo(0, 0);
    lastRoute = key;
    changed(route.view, route.news);
  }
  function go(view: View, news: NewsTab = "terkini") {
    const hash = `#${view}${view === "berita" && news === "arsip" ? "/arsip" : ""}`;
    if (browser.location.hash !== hash)
      browser.history.pushState(null, "", hash);
    sync();
  }
  root.querySelectorAll<HTMLAnchorElement>("[data-view]").forEach((link) => {
    link.onclick = (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      event.preventDefault();
      go(link.dataset.view as View);
    };
  });
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-news-tab]")];
  tabs.forEach((button, index) => {
    button.onclick = () => go("berita", button.dataset.newsTab as NewsTab);
    button.onkeydown = (event) => {
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : event.key === "ArrowRight"
              ? (index + 1) % tabs.length
              : event.key === "ArrowLeft"
                ? (index + tabs.length - 1) % tabs.length
                : -1;
      if (next < 0) return;
      event.preventDefault();
      tabs[next].focus();
      go("berita", tabs[next].dataset.newsTab as NewsTab);
    };
  });
  browser.addEventListener("hashchange", sync);
  sync();
  return { go, sync };
}
