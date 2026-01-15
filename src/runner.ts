import { $ } from 'bun';
import { parseOutput } from './parsers';
import type { LintResult, LintTarget } from './types';

export async function runLintCheck(target: LintTarget, rootDir: string): Promise<LintResult> {
	try {
		const output = await $`${{ raw: target.check }}`.cwd(rootDir).text();
		const errors = parseOutput(target.ecosystem, output, rootDir);
		return {
			ecosystem: target.ecosystem,
			target: target.pattern,
			errors,
			summary: {
				total: errors.length,
				fixable: errors.filter((e) => e.fixable).length,
				unfixable: errors.filter((e) => !e.fixable).length,
			},
		};
	} catch (e) {
		const stdoutOutput =
			typeof e === 'object' && e !== null && 'stdout' in e
				? String((e as { stdout?: string }).stdout)
				: '';
		const stderrOutput =
			typeof e === 'object' && e !== null && 'stderr' in e
				? String((e as { stderr?: string }).stderr)
				: '';
		const output = stdoutOutput || stderrOutput || '';
		const errors = parseOutput(target.ecosystem, output, rootDir);
		return {
			ecosystem: target.ecosystem,
			target: target.pattern,
			errors,
			summary: { total: errors.length, fixable: 0, unfixable: errors.length },
		};
	}
}

export async function runLintFix(target: LintTarget, rootDir: string): Promise<void> {
	try {
		await $`${{ raw: target.fix }}`.cwd(rootDir).quiet();
	} catch (_e) {}
}
