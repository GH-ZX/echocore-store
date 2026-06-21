export function sortGamesByCarousel(games = []) {
  return [...games].sort((a, b) => {
    const ao = a.carousel_order ?? 999999;
    const bo = b.carousel_order ?? 999999;
    if (ao !== bo) return ao - bo;
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

export function getCarouselGames(games = []) {
  return sortGamesByCarousel(games).filter((g) => g.show_in_carousel !== false);
}