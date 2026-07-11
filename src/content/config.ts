import { defineCollection, z } from 'astro:content';

const reports = defineCollection({
  type: 'data',
  schema: z.object({
    url: z.string().url(),
    domain: z.string(),
    label: z.string(),
    auditedAt: z.string(), // ISO date
    grade: z.enum(['A+', 'A', 'B', 'C', 'D', 'E', 'F']),
    pageWeightBytes: z.number(),
    co2PerVisitGrams: z.number(),
    co2PerYearKg: z.number(),
    cleanerThanPercent: z.number(), // 0-100, vs global averages
    greenHosting: z.boolean(),
    hostedBy: z.string().nullable(),
    monthlyVisits: z.number().default(10000),
    notes: z.string().optional(),
  }),
});

export const collections = { reports };
