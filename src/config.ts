import { z } from 'zod';

export const LintTargetSchema = z.object({
	pattern: z.string(),
	ecosystem: z.enum(['js', 'go', 'rust']),
	check: z.string(),
	fix: z.string(),
});

export const PluginConfigSchema = z.object({
	maxIterations: z.number().default(3),
	targets: z.array(LintTargetSchema),
});

export type Config = z.infer<typeof PluginConfigSchema>;
