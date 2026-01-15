export interface LintError {
	file: string;
	line: number;
	column: number;
	rule: string;
	severity: 'error' | 'warning';
	message: string;
	fixable: boolean;
}

export interface LintResult {
	ecosystem: string;
	target: string;
	errors: LintError[];
	summary: {
		total: number;
		fixable: number;
		unfixable: number;
	};
}

export interface LintTarget {
	pattern: string;
	ecosystem: 'js' | 'go' | 'rust';
	check: string;
	fix: string;
}

export interface PluginConfig {
	maxIterations: number;
	targets: LintTarget[];
}
