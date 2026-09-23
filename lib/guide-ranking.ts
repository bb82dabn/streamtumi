import type { GuideSort, GuideStation } from "@/lib/guide";

export function weightedRating(average: number, count: number, globalAverage: number, minimumWeight = 5): number {
  if (count <= 0) return 0;
  return (count / (count + minimumWeight)) * average + (minimumWeight / (count + minimumWeight)) * globalAverage;
}

export function compareGuideStations(sort: GuideSort): (left: GuideStation, right: GuideStation) => number {
  const stable = (left: GuideStation, right: GuideStation) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
  return (left, right) => {
    if (sort === "rating") return right.weightedRating - left.weightedRating || right.ratingCount - left.ratingCount || stable(left, right);
    if (sort === "fans") return right.fanCount - left.fanCount || right.viewerCount - left.viewerCount || stable(left, right);
    if (sort === "chat") return (Date.parse(right.lastChatAt ?? "1970-01-01") - Date.parse(left.lastChatAt ?? "1970-01-01")) || stable(left, right);
    if (sort === "newest") return Date.parse(right.createdAt) - Date.parse(left.createdAt) || stable(left, right);
    if (sort === "name") return stable(left, right);
    if (sort === "genre") return left.genreName.localeCompare(right.genreName) || stable(left, right);
    return Number(right.online) - Number(left.online) || right.viewerCount - left.viewerCount || right.fanCount - left.fanCount || stable(left, right);
  };
}
