// Общее визуальное состояние и позиционирование карточки, к которой перешёл пользователь.

const CARD_SCROLL_GAP = 16;

let highlightedCard = null;

export function getHighlightedCard() {
  return highlightedCard;
}

export function clearCardHighlight() {
  highlightedCard?.classList.remove("card-navigation-target");
  highlightedCard = null;
}

export function highlightCard(card) {
  clearCardHighlight();
  highlightedCard = card;
  highlightedCard?.classList.add("card-navigation-target");
}

export function scrollCardIntoView(card) {
  if (!card) return;

  const cardRect = card.getBoundingClientRect();
  const navigationBottom = document.querySelector(".workspace-nav")
    ?.getBoundingClientRect().bottom ?? 0;
  const desiredTop = navigationBottom + CARD_SCROLL_GAP;
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const nextTop = Math.max(
    0,
    Math.min(maxScroll, window.scrollY + cardRect.top - desiredTop),
  );

  window.scrollTo({
    top: nextTop,
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}
