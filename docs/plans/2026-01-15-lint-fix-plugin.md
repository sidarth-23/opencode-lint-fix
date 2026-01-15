# OpenCode Lint & Fix Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create an OpenCode plugin that runs linters on modified files at the end of a session, auto-fixes issues, and uses AI to fix remaining errors.

**Architecture:**
- **Trigger:** `session.idle` event.
- **Detection:** Match modified files (`file.edited`) against configured glob patterns.
- **Execution:** Run configured `check` and `fix` commands per ecosystem.
- **AI Loop:** Parse remaining errors -> structured JSON -> Prompt AI -> Retry loop (max 3 iterations).
- **Output:** Toast notification on success or final failure.

**Tech Stack:** TypeScript, Bun, OpenCode Plugin SDK, Zod (schema validation).

---

### Task 1: Project Setup & Configuration

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `src/types.ts`
- Create: `src/config.ts`

**Step 1: Update package.json**

Update `package.json` with correct name, build scripts, and dependencies.

```json
{
  "name": "@mystic-knight/opencode-lint-fix",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target node",
    "dev": "bun run build --watch",
    "typecheck": "tsc --noEmit",
    "link:global": "ln -sf $(pwd)/dist ~/.config/opencode/plugin/opencode-lint-fix",
    "unlink:global": "rm -f ~/.config/opencode/plugin/opencode-lint-fix"
  },
  "dependencies": {
    "@opencode-ai/plugin": "latest",
    "minimatch": "^9.0.3",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/minimatch": "^5.1.2",
    "typescript": "^5.3.3"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Step 2: Install dependencies**

Run: `bun install`

**Step 3: Define Types**

Create `src/types.ts`:

```typescript
export interface LintError {
  file: string;
  line: number;
  column: number;
  rule: string;
  severity: "error" | "warning";
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
  ecosystem: "js" | "go" | "rust";
  check: string;
  fix: string;
}

export interface PluginConfig {
  maxIterations: number;
  targets: LintTarget[];
}
```

**Step 4: Create Config Schema**

Create `src/config.ts`:

```typescript
import { z } from "zod";

export const LintTargetSchema = z.object({
  pattern: z.string(),
  ecosystem: z.enum(["js", "go", "rust"]),
  check: z.string(),
  fix: z.string(),
});

export const PluginConfigSchema = z.object({
  maxIterations: z.number().default(3),
  targets: z.array(LintTargetSchema),
});

export type Config = z.infer<typeof PluginConfigSchema>;
```

**Step 5: Verify build**

Run: `bun run build`
Expected: `dist/index.js` created.

**Step 6: Commit**

```bash
git add .
git commit -m "chore: initial project setup"
```

---

### Task 2: Output Parsers

**Files:**
- Create: `src/parsers/eslint.ts`
- Create: `src/parsers/golangci.ts`
- Create: `src/parsers/clippy.ts`
- Create: `src/parsers/index.ts`
- Test: `tests/parsers.test.ts`

**Step 1: Create ESLint Parser**

`src/parsers/eslint.ts`:

```typescript
import type { LintError } from "../types";

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
    return results.flatMap(file => 
      file.messages.map(msg => ({
        file: file.filePath.replace(rootDir + "/", ""), // Relative path
        line: msg.line,
        column: msg.column,
        rule: msg.ruleId || "unknown",
        severity: msg.severity === 2 ? "error" : "warning",
        message: msg.message,
        fixable: !!msg.fix
      }))
    );
  } catch (e) {
    console.error("Failed to parse ESLint output", e);
    return [];
  }
}
```

**Step 2: Create GolangCI Parser**

`src/parsers/golangci.ts` (JSON lines or array based on format):

```typescript
import type { LintError } from "../types";

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
    return (data.Issues || []).map(issue => ({
      file: issue.Pos.Filename,
      line: issue.Pos.Line,
      column: issue.Pos.Column,
      rule: issue.FromLinter,
      severity: "error", // Go linter mostly errors
      message: issue.Text,
      fixable: false // Assume mostly not fixable via simple command if it failed
    }));
  } catch (e) {
    return [];
  }
}
```

**Step 3: Create Clippy Parser**

`src/parsers/clippy.ts` (JSON lines):

```typescript
import type { LintError } from "../types";

export function parseClippy(output: string, rootDir: string): LintError[] {
  const errors: LintError[] = [];
  const lines = output.split('\n');
  
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.reason !== "compiler-message" || !msg.message) continue;
      
      const primarySpan = msg.message.spans?.find((s: any) => s.is_primary);
      if (!primarySpan) continue;

      errors.push({
        file: primarySpan.file_name,
        line: primarySpan.line_start,
        column: primarySpan.column_start,
        rule: msg.message.code?.code || "clippy",
        severity: msg.message.level === "error" ? "error" : "warning",
        message: msg.message.message,
        fixable: !!msg.message.children?.some((c: any) => c.level === "help" && c.message.includes("did you mean")) // Rough heuristic
      });
    } catch {}
  }
  return errors;
}
```

**Step 4: Create Parser Factory**

`src/parsers/index.ts`:

```typescript
import { parseEslint } from "./eslint";
import { parseGolangCi } from "./golangci";
import { parseClippy } from "./clippy";
import type { LintError } from "../types";

export function parseOutput(ecosystem: string, output: string, rootDir: string): LintError[] {
  switch (ecosystem) {
    case "js": return parseEslint(output, rootDir);
    case "go": return parseGolangCi(output);
    case "rust": return parseClippy(output, rootDir);
    default: return [];
  }
}
```

**Step 5: Write Tests**

Create `tests/parsers.test.ts` with sample JSON inputs for each linter.

**Step 6: Run Tests & Commit**

Run: `bun test`
Commit: `git commit -m "feat: implement linter output parsers"`

---

### Task 3: Core Logic (Detector & Runner)

**Files:**
- Create: `src/detector.ts`
- Create: `src/runner.ts`
- Test: `tests/detector.test.ts`

**Step 1: Implement File Matching**

`src/detector.ts`:

```typescript
import { minimatch } from "minimatch";
import type { LintTarget } from "./types";

export function getApplicableTargets(files: string[], targets: LintTarget[]): LintTarget[] {
  const uniqueTargets = new Set<LintTarget>();
  
  for (const file of files) {
    // Relative path check might be needed
    for (const target of targets) {
      if (minimatch(file, target.pattern)) {
        uniqueTargets.add(target);
        break; // First match wins for this file? Or all matches? Design said "deduplicates".
        // Let's assume first match wins per file to avoid double linting
      }
    }
  }
  
  return Array.from(uniqueTargets);
}
```

**Step 2: Implement Runner**

`src/runner.ts`:

```typescript
import { $ } from "bun";
import type { LintTarget, LintResult } from "./types";
import { parseOutput } from "./parsers";

export async function runLintCheck(target: LintTarget, rootDir: string): Promise<LintResult> {
  // Use shell to run command. NOTE: Checks often exit with non-zero code if errors found.
  // We need to capture stdout/stderr regardless of exit code.
  try {
    const output = await $`${{ raw: target.check }}`.cwd(rootDir).text();
    const errors = parseOutput(target.ecosystem, output, rootDir);
    return {
        ecosystem: target.ecosystem,
        target: target.pattern,
        errors,
        summary: {
            total: errors.length,
            fixable: errors.filter(e => e.fixable).length,
            unfixable: errors.filter(e => !e.fixable).length
        }
    };
  } catch (e: any) {
    // If command failed (exit code 1), it usually still produced output
    const output = e.stdout?.toString() || e.stderr?.toString() || "";
    const errors = parseOutput(target.ecosystem, output, rootDir);
    return {
        ecosystem: target.ecosystem,
        target: target.pattern,
        errors,
        summary: { total: errors.length, fixable: 0, unfixable: errors.length }
    };
  }
}

export async function runLintFix(target: LintTarget, rootDir: string): Promise<void> {
    try {
        await $`${{ raw: target.fix }}`.cwd(rootDir).quiet();
    } catch (e) {
        // Fix command might fail if it can't fix everything, just ignore
    }
}
```

**Step 3: Tests & Commit**

Run: `bun test`
Commit: `git commit -m "feat: implement detector and runner logic"`

---

### Task 4: Plugin Entry Point & AI Loop

**Files:**
- Modify: `src/index.ts`

**Step 1: Implement Main Plugin Function**

`src/index.ts`:

```typescript
import type { Plugin } from "@opencode-ai/plugin";
import { PluginConfigSchema } from "./config";
import { getApplicableTargets } from "./detector";
import { runLintCheck, runLintFix } from "./runner";

export const LintFixPlugin: Plugin = async ({ project, client, directory }) => {
  // 1. Load Config
  const rawConfig = project.config?.["lint-fix"];
  if (!rawConfig) return {}; // Not configured
  
  const config = PluginConfigSchema.safeParse(rawConfig);
  if (!config.success) {
    client.app.log({ service: "lint-fix", level: "error", message: "Invalid config", extra: config.error });
    return {};
  }

  return {
    "session.idle": async (event) => {
      // 2. Detect Modified Files
      // We need a way to track modified files. 
      // Option: git diff --name-only HEAD (if in git repo) or use internal tracking if available.
      // The design mentioned checking `file.edited` events, but session.idle is a snapshot.
      // Best approach: Use git diff against the previous commit or just git status for modified files.
      // Or simply: git diff --name-only (unstaged + staged)
      
      const { stdout } = await Bun.$`git diff --name-only`.cwd(directory).quiet();
      const files = stdout.toString().split("\n").filter(Boolean);
      
      if (files.length === 0) return;

      const targets = getApplicableTargets(files, config.data.targets);
      if (targets.length === 0) return;

      await client.tui.showToast({ body: { message: "Running lint checks...", variant: "info" } });

      let iteration = 0;
      let clean = false;

      while (iteration < config.data.maxIterations && !clean) {
        iteration++;
        clean = true;
        const allResults = [];

        for (const target of targets) {
            // Check
            let result = await runLintCheck(target, directory);
            
            // Auto-fix if errors exist
            if (result.errors.length > 0) {
                await runLintFix(target, directory);
                // Re-check
                result = await runLintCheck(target, directory);
            }

            if (result.errors.length > 0) {
                clean = false;
                allResults.push(result);
            }
        }

        if (clean) break;

        // Send to AI
        if (allResults.length > 0) {
             await client.session.prompt({
                path: { id: event.sessionID }, // Assuming event has sessionID or we get it from context
                body: {
                    parts: [{
                        type: "text",
                        text: JSON.stringify({
                            task: "fix_lint_errors",
                            instruction: "Fix these lint errors by editing the files. Do not disable lint rules.",
                            iteration,
                            maxIterations: config.data.maxIterations,
                            results: allResults
                        })
                    }]
                }
            });
            // Wait for AI response? 
            // session.idle fires when AI is done. If we prompt here, it triggers a NEW turn.
            // This function (session.idle hook) will finish, AI will run, then session.idle fires AGAIN.
            // So we just prompt ONCE and exit. The loop happens via recursive event firing.
            // Wait. If we loop inside the hook, we are blocking.
            // If we prompt the AI, the AI starts working. We should EXIT this hook.
            // When AI finishes, session.idle fires AGAIN.
            
            // REVISED LOGIC:
            // This hook runs at end of *every* turn.
            // We need to know if we are *already* in a lint loop to avoid infinite loops if AI fails to fix.
            // We can check the last message. If it was our lint prompt, and errors persist -> increment count.
            
            // Actually, simply prompting the AI will cause the AI to run.
            // When AI finishes, `session.idle` fires again.
            // We need to track state. Context? 
            // We can't easily persist state across hook calls unless we write to a temp file or use session state.
            // Simplified approach for V1:
            // Just run check. If errors -> Prompt AI.
            // BUT: How do we stop after 3 tries?
            // We can inspect the chat history (messages) to count how many "fix_lint_errors" prompts we sent recently.
            
            return; // Exit and let AI work
        }
      }

      if (clean) {
        await client.tui.showToast({ body: { message: "Lint passed ✓", variant: "success" } });
      } else {
        await client.tui.showToast({ body: { message: "Lint failed after retries", variant: "error" } });
      }
    }
  };
};
```

**Step 2: Refine Loop Logic (State Management)**

We need to read session history to implement the loop counter correctly without external state.

```typescript
// Inside session.idle:
const history = await client.session.messages({ path: { id: event.sessionID } });
const lintPrompts = history.info.filter(m => 
    m.role === "user" && m.content.includes('"task":"fix_lint_errors"')
).length;

if (lintPrompts >= config.data.maxIterations) {
    // Stop, just show toast
    return; 
}
```

**Step 3: Commit**

```bash
git commit -m "feat: implement main plugin logic and recursive AI loop"
```

---

### Task 5: CI/CD Setup

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/publish.yml`

**Step 1: CI Workflow**

Standard build & test.

**Step 2: Publish Workflow**

NPM publish on release.

**Step 3: Commit**

```bash
git add .github
git commit -m "ci: add workflows"
```

---
