import { z } from "zod";
import { issuePrioritySchema, issueTypeSchema } from "./issues.js";

export const widgetExchangeSchema = z
  .object({
    handoffCode: z.string().trim().min(1, "Handoff code is required"),
  })
  .strict();

export type WidgetExchangeInput = z.infer<typeof widgetExchangeSchema>;

export const widgetBoundingBoxSchema = z
  .object({
    top: z.number(),
    left: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .strict();

export const widgetElementContextSchema = z
  .object({
    tagName: z.string().trim().max(50),
    id: z.string().trim().max(100).nullable().optional(),
    classList: z.array(z.string().trim().max(100)).max(25).optional(),
    textContent: z.string().trim().max(200).nullable().optional(),
    xpath: z.string().trim().max(500).nullable().optional(),
    boundingBox: widgetBoundingBoxSchema.optional(),
  })
  .strict();

export const widgetViewportContextSchema = z
  .object({
    width: z.number().positive(),
    height: z.number().positive(),
    devicePixelRatio: z.number().positive().optional(),
  })
  .strict();

export const widgetScrollContextSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .strict();

export const widgetBrowserContextSchema = z
  .object({
    userAgent: z.string().trim().max(512).optional(),
    language: z.string().trim().max(35).optional(),
    platform: z.string().trim().max(50).optional(),
  })
  .strict();

export const widgetIssueContextSchema = z
  .object({
    selector: z.string().trim().max(1000).optional(),
    element: widgetElementContextSchema.optional(),
    viewport: widgetViewportContextSchema,
    scroll: widgetScrollContextSchema.optional(),
    browser: widgetBrowserContextSchema.optional(),
    timestamp: z.string().datetime().optional(),
  })
  .strict();

export type WidgetIssueContext = z.infer<typeof widgetIssueContextSchema>;

export const createWidgetIssueSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Title is required")
      .max(255, "Title must be at most 255 characters"),
    description: z
      .string()
      .trim()
      .max(10000, "Description must be at most 10,000 characters")
      .transform((val) => (val === "" ? null : val))
      .nullable()
      .optional(),
    type: issueTypeSchema.default("BUG"),
    priority: issuePrioritySchema.default("MEDIUM"),
    pageUrl: z.string().url("Invalid page URL").max(2048, "Page URL must be at most 2,048 characters"),
    context: widgetIssueContextSchema,
    clientMutationId: z.string().trim().max(128).optional(),
  })
  .strict();

export type CreateWidgetIssueInput = z.infer<typeof createWidgetIssueSchema>;
