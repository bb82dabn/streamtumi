import { z } from "zod";

const absoluteUrlSchema = z.string().url();

export const stationKindSchema = z.enum(["TV", "RADIO"]);
export const playbackKindSchema = z.enum(["SCHEDULED_TV", "CONTINUOUS_RADIO", "PERSONALIZED_WEATHER"]);

export const catalogGenreSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  explicit: z.boolean(),
  stationCount: z.number().int().nonnegative(),
});

export const catalogStationSchema = z.object({
  id: z.string(),
  token: z.string().min(1),
  stationKind: stationKindSchema,
  playbackKind: playbackKindSchema,
  name: z.string(),
  description: z.string(),
  ownerName: z.string(),
  genreId: z.string(),
  genreName: z.string(),
  online: z.boolean(),
  explicit: z.boolean(),
  viewerCount: z.number().int().nonnegative(),
  fanCount: z.number().int().nonnegative(),
  ratingAverage: z.number().nonnegative(),
  ratingCount: z.number().int().nonnegative(),
  lastChatAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  artworkUrl: absoluteUrlSchema.nullable(),
  stationUrl: absoluteUrlSchema,
  chatUrl: absoluteUrlSchema,
  nowPlaying: z.object({ title: z.string(), artist: z.string() }).nullable(),
  isFeatured: z.boolean(),
  isFan: z.boolean(),
  viewerRating: z.number().int().min(1).max(5).nullable(),
  isOwner: z.boolean(),
});

export const mobileHomeSectionSchema = z.object({
  id: z.union([
    z.enum(["featured", "fans", "recent", "popular", "tv", "radio"]),
    z.string().regex(/^genre:.+$/),
  ]),
  kind: z.enum(["FEATURED", "FANS", "RECENT", "POPULAR", "TV", "RADIO", "GENRE"]),
  title: z.string(),
  genreId: z.string().optional(),
  stationIds: z.array(z.string()),
});

export const mobileCatalogSchema = z.object({
  apiVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  explicitIncluded: z.boolean(),
  genres: z.array(catalogGenreSchema),
  stations: z.array(catalogStationSchema),
  homeSections: z.array(mobileHomeSectionSchema),
});

export type StationKind = z.infer<typeof stationKindSchema>;
export type CatalogGenre = z.infer<typeof catalogGenreSchema>;
export type CatalogStation = z.infer<typeof catalogStationSchema>;
export type MobileHomeSection = z.infer<typeof mobileHomeSectionSchema>;
export type MobileCatalog = z.infer<typeof mobileCatalogSchema>;
