import type { LintError } from '../types';

interface EslintMessage {
	ruleId: string;
	severity: number;
	message: string;
	line: number;
	column: number;
	fix?: object;
}

interface EslintResult {
	filePath: string;
	messages: EslintMessage[];
}

export function parseEslint(output: string, rootDir: string): LintError[] {
	try {
		const results: EslintResult[] = JSON.parse(output);
		return results.flatMap((file) =>
			file.messages.map((msg) => ({
				file: file.filePath.replace(`${rootDir}/`, ''),
				line: msg.line,
				column: msg.column,
				rule: msg.ruleId || 'unknown',
				severity: msg.severity === 2 ? 'error' : 'warning',
				message: msg.message,
				fixable: !!msg.fix,
			})),
		);
	} catch (e) {
		console.error('Failed to parse ESLint output', e);
		return [];
	}
}
