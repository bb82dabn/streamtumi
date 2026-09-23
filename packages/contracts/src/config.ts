import { z } from "zod";

export const mobileConfigSchema = z.object({
  apiVersion: z.literal(1),
  registrationEnabled: z.boolean(),
}).strict();

export type MobileConfig = z.infer<typeof mobileConfigSchema>;
