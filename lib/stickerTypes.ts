export type StickerKind =
  | "image"
  | "sun"
  | "palm"
  | "wave"
  | "badge"
  | "coconut"
  | "star"
  | "builder";

export const STICKER_LABELS: Record<StickerKind, string> = {
  image: "Image",
  sun: "Sunrise",
  palm: "Palm",
  wave: "Wave",
  badge: "#FrameInGoa",
  coconut: "Coconut",
  star: "Starburst",
  builder: "Builder tag",
};
