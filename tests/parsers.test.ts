import { expect, test } from 'bun:test';
import { parseClippy } from '../src/parsers/clippy';
import { parseEslint } from '../src/parsers/eslint';
import { parseGolangCi } from '../src/parsers/golangci';

test('parseEslint should parse valid JSON output', () => {
	const output = JSON.stringify([
		{
			filePath: '/home/user/project/src/file.ts',
			messages: [
				{
					ruleId: 'no-unused-vars',
					severity: 2,
					message: "Variable 'x' is not used",
					line: 10,
					column: 5,
					fix: { range: [0, 10], text: '' },
				},
			],
		},
	]);

	const errors = parseEslint(output, '/home/user/project');
	expect(errors).toHaveLength(1);
	expect(errors[0]).toMatchObject({
		file: 'src/file.ts',
		line: 10,
		column: 5,
		rule: 'no-unused-vars',
		severity: 'error',
		message: "Variable 'x' is not used",
		fixable: true,
	});
});

test('parseEslint should handle warnings', () => {
	const output = JSON.stringify([
		{
			filePath: '/home/user/project/src/file.ts',
			messages: [
				{
					ruleId: 'no-console',
					severity: 1,
					message: 'Unexpected console statement',
					line: 5,
					column: 1,
				},
			],
		},
	]);

	const errors = parseEslint(output, '/home/user/project');
	expect(errors).toHaveLength(1);
	expect(errors[0]?.severity).toBe('warning');
});

test('parseEslint should handle empty output', () => {
	const errors = parseEslint('[]', '/home/user/project');
	expect(errors).toHaveLength(0);
});

test('parseEslint should handle malformed JSON', () => {
	const originalError = console.error;
	console.error = () => {};
	const errors = parseEslint('invalid json', '/home/user/project');
	expect(errors).toHaveLength(0);
	console.error = originalError;
});

test('parseEslint should make paths relative to root', () => {
	const output = JSON.stringify([
		{
			filePath: '/home/user/project/src/nested/deep/file.ts',
			messages: [
				{
					ruleId: 'prefer-const',
					severity: 2,
					message: 'Variable is reassigned',
					line: 1,
					column: 1,
				},
			],
		},
	]);

	const errors = parseEslint(output, '/home/user/project');
	expect(errors[0]?.file).toBe('src/nested/deep/file.ts');
});

test('parseGolangCi should parse valid JSON output', () => {
	const output = JSON.stringify({
		Issues: [
			{
				FromLinter: 'golint',
				Text: 'missing comment',
				Pos: {
					Filename: 'main.go',
					Line: 10,
					Column: 1,
				},
			},
		],
	});

	const errors = parseGolangCi(output);
	expect(errors).toHaveLength(1);
	expect(errors[0]).toMatchObject({
		file: 'main.go',
		line: 10,
		column: 1,
		rule: 'golint',
		severity: 'error',
		message: 'missing comment',
		fixable: false,
	});
});

test('parseGolangCi should handle empty issues', () => {
	const output = JSON.stringify({ Issues: [] });
	const errors = parseGolangCi(output);
	expect(errors).toHaveLength(0);
});

test('parseClippy should parse JSON lines output', () => {
	const output = JSON.stringify({
		reason: 'compiler-message',
		message: {
			message: 'use of deprecated item',
			level: 'warning',
			spans: [
				{
					file_name: 'src/main.rs',
					line_start: 5,
					column_start: 10,
					is_primary: true,
				},
			],
			code: { code: 'deprecated' },
		},
	});

	const errors = parseClippy(output, '/home/user/project');
	expect(errors).toHaveLength(1);
	expect(errors[0]).toMatchObject({
		file: 'src/main.rs',
		line: 5,
		column: 10,
		rule: 'deprecated',
		severity: 'warning',
		message: 'use of deprecated item',
	});
});

test('parseClippy should ignore non-message lines', () => {
	const output =
		JSON.stringify({ reason: 'build-finished' }) +
		'\n' +
		JSON.stringify({
			reason: 'compiler-message',
			message: { level: 'error', spans: [], message: 'test' },
		});

	const errors = parseClippy(output, '/home/user/project');
	expect(errors).toHaveLength(0);
});
