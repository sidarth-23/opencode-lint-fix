import { expect, test } from 'bun:test';
import { getApplicableTargets } from '../src/detector';
import type { LintTarget } from '../src/types';

test('getApplicableTargets should match files against patterns', () => {
	const targets: LintTarget[] = [
		{ pattern: 'src/**/*.ts', ecosystem: 'js', check: 'echo', fix: 'echo' },
		{ pattern: 'tests/**/*.test.ts', ecosystem: 'js', check: 'echo', fix: 'echo' },
	];

	const files = ['src/index.ts', 'src/utils.ts', 'tests/parsers.test.ts'];
	const result = getApplicableTargets(files, targets);

	expect(result).toHaveLength(2);
	expect(result).toContainEqual(targets[0]);
	expect(result).toContainEqual(targets[1]);
});

test('getApplicableTargets should deduplicate targets', () => {
	const targets: LintTarget[] = [
		{ pattern: 'src/**/*.ts', ecosystem: 'js', check: 'echo', fix: 'echo' },
	];

	const files = ['src/index.ts', 'src/utils.ts'];
	const result = getApplicableTargets(files, targets);

	expect(result).toHaveLength(1);
	expect(result[0]).toEqual(targets[0]);
});

test('getApplicableTargets should return empty array if no matches', () => {
	const targets: LintTarget[] = [
		{ pattern: 'src/**/*.ts', ecosystem: 'js', check: 'echo', fix: 'echo' },
	];

	const files = ['docs/README.md', '.gitignore'];
	const result = getApplicableTargets(files, targets);

	expect(result).toHaveLength(0);
});

test('getApplicableTargets should handle empty files list', () => {
	const targets: LintTarget[] = [
		{ pattern: 'src/**/*.ts', ecosystem: 'js', check: 'echo', fix: 'echo' },
	];

	const result = getApplicableTargets([], targets);

	expect(result).toHaveLength(0);
});
