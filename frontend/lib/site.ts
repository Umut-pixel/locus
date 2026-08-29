export const APP_NAME = "Patinfo";

/** Sekme: `Patinfo · Analyst` — nested layout’larda şablon kaybolmasın diye absolute. */
export function pageMetadata(title: string) {
  return { title: { absolute: `${APP_NAME} · ${title}` } } as const;
}
