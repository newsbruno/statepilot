import { z } from "zod";

const timeoutSchema = z.number().int().positive().optional();

const selectorSchema = z.string().min(1, { error: "Selector cannot be empty" });

export const ClickActionSchema = z.object({
  type: z.literal("click"),
  selector: selectorSchema,
  elementId: z.string().min(1).optional(),
  timeoutMs: timeoutSchema
});

export const FillActionSchema = z.object({
  type: z.literal("fill"),
  selector: selectorSchema,
  value: z.string(),
  sensitive: z.boolean().optional(),
  timeoutMs: timeoutSchema
});

export const PressActionSchema = z.object({
  type: z.literal("press"),
  key: z.string().min(1, { error: "Key cannot be empty" }),
  timeoutMs: timeoutSchema
});

export const WaitConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("selector"),
    selector: selectorSchema,
    state: z.enum(["attached", "visible", "hidden"]).optional()
  }),
  z.object({
    type: z.literal("url"),
    value: z.union([z.string().min(1), z.instanceof(RegExp)])
  }),
  z.object({
    type: z.literal("timeout"),
    ms: z.number().int().nonnegative()
  }),
  z.object({
    type: z.literal("network_idle")
  })
]);

export const WaitActionSchema = z.object({
  type: z.literal("wait_for"),
  condition: WaitConditionSchema,
  timeoutMs: timeoutSchema
});

export const NavigateActionSchema = z.object({
  type: z.literal("navigate"),
  url: z.url({ error: "Navigate action requires a valid URL" }),
  timeoutMs: timeoutSchema
});

export const ExtractActionSchema = z.object({
  type: z.literal("extract"),
  schema: z.record(z.string(), z.unknown()),
  source: z.enum(["dom", "text", "screenshot", "mixed"]).optional(),
  timeoutMs: timeoutSchema
});

export const UploadFileActionSchema = z.object({
  type: z.literal("upload_file"),
  selector: selectorSchema,
  filePath: z.string().min(1, { error: "File path cannot be empty" }),
  sensitive: z.boolean().optional(),
  timeoutMs: timeoutSchema
});

export const SelectActionSchema = z.object({
  type: z.literal("select"),
  selector: selectorSchema,
  value: z.string().min(1, { error: "Select value cannot be empty" }),
  timeoutMs: timeoutSchema
});

export const NoopActionSchema = z.object({
  type: z.literal("noop"),
  reason: z.string().optional(),
  timeoutMs: timeoutSchema
});

export const AgentActionSchema = z.discriminatedUnion("type", [
  ClickActionSchema,
  FillActionSchema,
  PressActionSchema,
  WaitActionSchema,
  NavigateActionSchema,
  ExtractActionSchema,
  UploadFileActionSchema,
  SelectActionSchema,
  NoopActionSchema
]);

export function parseAgentAction(input: unknown) {
  return AgentActionSchema.parse(input);
}
