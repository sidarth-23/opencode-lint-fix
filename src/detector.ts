import { minimatch } from 'minimatch';
import type { LintTarget } from './types';

export function getApplicableTargets(files: string[], targets: LintTarget[]): LintTarget[] {
	const uniqueTargets = new Set<LintTarget>();

	for (const file of files) {
		for (const target of targets) {
			if (minimatch(file, target.pattern)) {
				uniqueTargets.add(target);
				break;
			}
		}
	}

	return Array.from(uniqueTargets);
}
