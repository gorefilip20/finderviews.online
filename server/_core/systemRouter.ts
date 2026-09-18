import { z } from "zod";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(z.object({ timestamp: z.number().min(0, "timestamp cannot be negative") }))
    .query(() => ({ ok: true })),
  notifyOwner: adminProcedure
    .input(z.object({ title: z.string().min(1), content: z.string().min(1) }))
    .mutation(async () => ({ success: true })),
});
