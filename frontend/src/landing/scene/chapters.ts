/** Scroll-progress boundaries between the story chapters (shared by the scene and the DOM overlay). */
export const CHAPTER_BOUNDS = [0.12, 0.26, 0.42, 0.56, 0.72, 0.86];

export function chapterOf(p: number): number {
  const i = CHAPTER_BOUNDS.findIndex((b) => p < b);
  return i === -1 ? CHAPTER_BOUNDS.length : i;
}
