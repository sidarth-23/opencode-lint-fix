import type { LintError } from '../types';

export function parseClippy(output: string, _rootDir: string): LintError[] {
	const errors: LintError[] = [];
	const lines = output.split('\n');

	for (const line of lines) {
		if (!line.trim()) continue;
		try {
			const msg = JSON.parse(line);
			if (msg.reason !== 'compiler-message' || !msg.message) continue;

			const primarySpan = msg.message.spans?.find((s: { is_primary: boolean }) => s.is_primary);
			if (!primarySpan) continue;

			errors.push({
				file: primarySpan.file_name,
				line: primarySpan.line_start,
				column: primarySpan.column_start,
				rule: msg.message.code?.code || 'clippy',
				severity: msg.message.level === 'error' ? 'error' : 'warning',
				message: msg.message.message,
				fixable: !!msg.message.children?.some(
					(c: { level: string; message: string }) =>
						c.level === 'help' && c.message.includes('did you mean'),
				),
			});
		} catch {}
	}
	return errors;
}
