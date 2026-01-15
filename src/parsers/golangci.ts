import type { LintError } from '../types';

interface GoIssue {
	FromLinter: string;
	Text: string;
	Pos: { Filename: string; Line: number; Column: number };
}

interface GoOutput {
	Issues: GoIssue[];
}

export function parseGolangCi(output: string): LintError[] {
	try {
		const data: GoOutput = JSON.parse(output);
		return (data.Issues || []).map((issue) => ({
			file: issue.Pos.Filename,
			line: issue.Pos.Line,
			column: issue.Pos.Column,
			rule: issue.FromLinter,
			severity: 'error',
			message: issue.Text,
			fixable: false,
		}));
	} catch (_e) {
		return [];
	}
}
