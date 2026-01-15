import type { LintError } from '../types';
import { parseClippy } from './clippy';
import { parseEslint } from './eslint';
import { parseGolangCi } from './golangci';

export function parseOutput(ecosystem: string, output: string, rootDir: string): LintError[] {
	switch (ecosystem) {
		case 'js':
			return parseEslint(output, rootDir);
		case 'go':
			return parseGolangCi(output);
		case 'rust':
			return parseClippy(output, rootDir);
		default:
			return [];
	}
}
