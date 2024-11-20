import {z} from "zod";

export type Orbit = 'North' | 'Equator' | 'South';

export const orbitList: Orbit[] = ['North', 'Equator', 'South'];

const BskyImageSchema = z.object({
  alt: z.string().optional(),
  image: z.object({
    "$type": z.literal("blob"),
    ref: z.object({
      "$link": z.string(),
    }),
    mimeType: z.string(),
    size: z.number(),
  })
});

export type BskyImage = z.infer<typeof BskyImageSchema>;

export const ImageEntrySchema = z.object({
  entity: z.object({
    text: z.string(),
    osm: z.object({
      osm_type: z.enum(["node", "way", "relation"]),
      osm_id: z.number(),
      lat: z.string().transform(parseFloat),
      lon: z.string().transform(parseFloat),
      category: z.string(),
      type: z.string(),
      name: z.string(),
      display_name: z.string(),
      boundingbox: z.tuple([
        z.string().transform(parseFloat),
        z.string().transform(parseFloat),
        z.string().transform(parseFloat),
        z.string().transform(parseFloat),
      ]),
    })
  }),
  image: BskyImageSchema,
  event: z.object({
    did: z.string(),
    time_us: z.number(),
    type: z.literal("com"),
    kind: z.literal("commit"),
    commit: z.object({
      rev: z.string(),
      collection: z.literal("app.bsky.feed.post"),
      rkey: z.string(),
      record: z.object({
        "$type": z.literal("app.bsky.feed.post"),
        createdAt: z.string(),
        embed: z.object({
          "$type": z.literal("app.bsky.embed.images"),
          images: z.array(BskyImageSchema),
        }),
      })
    })
  })
});

export type ImageEntry = z.infer<typeof ImageEntrySchema>;
