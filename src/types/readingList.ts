import { z } from "zod";

export const readingListKindSchema = z.enum(["article", "video", "repo", "doc"]);
export type ReadingListKind = z.infer<typeof readingListKindSchema>;

export const readingListStatusSchema = z.enum(["todo", "reading", "done", "later"]);
export type ReadingListStatus = z.infer<typeof readingListStatusSchema>;

export const readingListItemSchema = z.object({
  id: z.number().int().optional(),
  domain: z.string(),
  sourceId: z.string().nullable().default(null),
  title: z.string().min(1),
  url: z.string().nullable().default(null),
  kind: readingListKindSchema.default("doc"),
  status: readingListStatusSchema.default("todo"),
  addedAt: z.string(),
  readAt: z.string().nullable().default(null),
  dwellSeconds: z.number().int().nonnegative().default(0),
});
export type ReadingListItem = z.infer<typeof readingListItemSchema>;

export const newReadingListItemSchema = z.object({
  domain: z.string(),
  sourceId: z.string().nullable().default(null),
  title: z.string().min(1),
  url: z.string().nullable().default(null),
  kind: readingListKindSchema.default("doc"),
  status: readingListStatusSchema.default("todo"),
  addedAt: z.string(),
  readAt: z.string().nullable().default(null),
  dwellSeconds: z.number().int().nonnegative().default(0),
});
export type NewReadingListItem = z.input<typeof newReadingListItemSchema>;

export function parseReadingListItem(input: unknown) {
  return readingListItemSchema.safeParse(input);
}
