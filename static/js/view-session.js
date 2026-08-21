// Состояние представления, которое сохраняется в пределах вкладки браузера.

import { byId, autoGrowAllTextareas } from "./dom.js";

const ACTIVE_TAB_STORAGE_KEY = "activeTab";
const SCROLL_STORAGE_KEY = "report_app_scroll";

/** Показывает нужную вкладку и запоминает выбор до конца сессии. */
function activateTab(tabName) {
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });

  const isCasesTab = tabName === "cases";
  byId("casesPane").style.display = isCasesTab ? "" : "none";
  byId("bugsPane").style.display = isCasesTab ? "none" : "";

  sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, tabName);

  // панель рисовалась скрытой, а у скрытой scrollHeight = 0 —
  // высоту textarea можно посчитать только сейчас, когда она видима
  autoGrowAllTextareas();
}

export function initTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      activateTab(tab.dataset.tab);
      window.scrollTo(0, 0);
    });
  });
}

/** Восстанавливает активную вкладку до отрисовки её содержимого. */
export function restoreSavedTab() {
  activateTab(sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY) || "cases");
}

/** Запоминает позицию прокрутки перед уходом со страницы. */
export function initScrollMemory() {
  // браузер восстанавливает прокрутку сам, но к тому моменту страница ещё пуста —
  // забираем это на себя, чтобы он не мешал
  history.scrollRestoration = "manual";

  window.addEventListener("beforeunload", () => {
    sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY));
  });
}

/** Возвращает прокрутку туда, где она была до перезагрузки. */
export function restoreScroll() {
  const saved = Number(sessionStorage.getItem(SCROLL_STORAGE_KEY));
  if (!saved) return;

  // textarea растягиваются в render(), высота страницы меняется —
  // прокручиваем следующим кадром, когда раскладка уже посчитана
  requestAnimationFrame(() => window.scrollTo(0, saved));
}
