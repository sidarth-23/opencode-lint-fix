import { join } from 'node:path';
import type { Plugin } from '@opencode-ai/plugin';
import { PluginConfigSchema } from './config';
import { getApplicableTargets } from './detector';
import { runLintCheck, runLintFix } from './runner';

export const LintFixPlugin: Plugin = async ({ client, directory, $ }) => {
	const configPath = join(directory, '.opencode', 'lint-fix.json');
	const configFile = Bun.file(configPath);

	if (!(await configFile.exists())) {
		return {};
	}

	let rawConfig: unknown;
	try {
		rawConfig = await configFile.json();
	} catch (e) {
		console.error('Failed to parse lint-fix config', e);
		return {};
	}

	const config = PluginConfigSchema.safeParse(rawConfig);
	if (!config.success) {
		console.error('Invalid lint-fix config', config.error);
		return {};
	}

	return {
		event: async ({ event }) => {
			if (event.type !== 'session.idle') return;

			const sessionID = event.properties.sessionID;

			const result = await $`git diff --name-only`.cwd(directory).nothrow();
			const files = result.stdout.toString().split('\n').filter(Boolean);

			if (files.length === 0) return;

			const targets = getApplicableTargets(files, config.data.targets);
			if (targets.length === 0) return;

			const history = await client.session.messages({ path: { id: sessionID } });
			const messages = history.data || [];
			const lintPrompts = messages.filter(
				(m) =>
					m.info.role === 'user' &&
					m.parts.some((p) => p.type === 'text' && p.text?.includes('"task":"fix_lint_errors"')),
			).length;

			if (lintPrompts >= config.data.maxIterations) {
				return;
			}

			await client.tui.showToast({ body: { message: 'Running lint checks...', variant: 'info' } });

			const allResults = [];
			for (const target of targets) {
				let result = await runLintCheck(target, directory);

				if (result.errors.length > 0) {
					await runLintFix(target, directory);
					result = await runLintCheck(target, directory);
				}

				if (result.errors.length > 0) {
					allResults.push(result);
				}
			}

			if (allResults.length === 0) {
				await client.tui.showToast({ body: { message: 'Lint passed ✓', variant: 'success' } });
				return;
			}

			const iteration = lintPrompts + 1;
			if (iteration < config.data.maxIterations) {
				await client.session.prompt({
					path: { id: sessionID },
					body: {
						parts: [
							{
								type: 'text',
								text: JSON.stringify({
									task: 'fix_lint_errors',
									instruction: 'Fix these lint errors by editing files. Do not disable lint rules.',
									iteration,
									maxIterations: config.data.maxIterations,
									results: allResults,
								}),
							},
						],
					},
				});
			} else {
				await client.tui.showToast({
					body: { message: 'Lint failed after retries', variant: 'error' },
				});
			}
		},
	};
};
