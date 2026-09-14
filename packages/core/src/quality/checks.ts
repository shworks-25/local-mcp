import {
    access,
} from 'node:fs/promises';
import {
    join,
} from 'node:path';

import type {
    ResolvedProject,
} from '../project/resolver.js';
import type {
    DeveloperRuntime,
} from '../runtime/developer-runtime.js';
import {
    packageRunScript,
    packageScripts,
} from '../package/scripts.js';
import {
    runTask,
    type ProcessResult,
} from '../shell/runner.js';

export interface DiagnosticItem {
    line: string;
}

export interface QualityResult {
    kind: 'test' | 'typecheck' | 'lint';
    source: 'task' | 'package-script';
    success: boolean;
    code: number;
    timedOut: boolean;
    stdout: string;
    stderr: string;
    diagnostics: DiagnosticItem[];
    diagnosticParser: 'heuristic';
}

function getLastTestResults(
    runtime: DeveloperRuntime,
): Map<string, QualityResult> {
    return runtime.getStore(
        'quality:last-test-results',
        () => new Map<string, QualityResult>(),
    );
}

const FALSE_POSITIVE_DIAGNOSTIC_PATTERNS = [
    /\b0\s+failed\b/i,
    /\b0\s+errors?\b/i,
    /\b0\s+warnings?\b/i,
    /\bno\s+errors?\b/i,
    /\bno\s+warnings?\b/i,
    /\ball\s+tests?\s+passed\b/i,
    /\btests?:\s*0\s+fail/i,
];

function diagnosticsFrom(
    result: ProcessResult,
): DiagnosticItem[] {
    const lines = `${result.stdout}\n${result.stderr}`
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => {
            const hasSignal =
                /error|fail|failed|warning|warn|✖|×|ts\(\d+\)|:\d+:\d+/.test(
                    line.toLowerCase(),
                );

            if (!hasSignal) {
                return false;
            }

            return !FALSE_POSITIVE_DIAGNOSTIC_PATTERNS.some((pattern) =>
                pattern.test(line),
            );
        })
        .slice(0, 200);

    return lines.map((line) => ({ line }));
}

async function exists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

async function runSyntheticTask(
    project: ResolvedProject,
    name: string,
    program: string,
    args: string[],
): Promise<ProcessResult> {
    const cloned: ResolvedProject = {
        ...project,
        config: {
            ...project.config,
            commands: {
                ...project.config.commands,
                [name]: {
                    program,
                    args,
                    cwd: '.',
                    env: {},
                    timeoutMs: 180_000,
                },
            },
        },
    };

    return runTask(cloned, name);
}

async function runLanguageDefault(
    project: ResolvedProject,
    kind: 'test' | 'typecheck' | 'lint',
): Promise<ProcessResult | undefined> {
    if (await exists(join(project.root, 'go.mod'))) {
        if (kind === 'lint') {
            return runSyntheticTask(
                project,
                '__quality_go_vet__',
                'go',
                ['vet', './...'],
            );
        }
        return runSyntheticTask(
            project,
            `__quality_go_${kind}__`,
            'go',
            ['test', './...'],
        );
    }

    if (await exists(join(project.root, 'Package.swift'))) {
        if (kind === 'lint') {
            return undefined;
        }
        return runSyntheticTask(
            project,
            `__quality_swift_${kind}__`,
            'swift',
            [kind === 'test' ? 'test' : 'build'],
        );
    }

    if (await exists(join(project.root, 'pubspec.yaml'))) {
        return runSyntheticTask(
            project,
            `__quality_flutter_${kind}__`,
            'flutter',
            kind === 'test'
                ? ['test']
                : ['analyze'],
        );
    }

    if (
        await exists(join(project.root, 'gradlew')) ||
        await exists(join(project.root, 'gradlew.bat'))
    ) {
        if (kind === 'lint') {
            return runSyntheticTask(
                project,
                '__quality_gradle_lint__',
                './gradlew',
                ['check'],
            );
        }
        return runSyntheticTask(
            project,
            `__quality_gradle_${kind}__`,
            './gradlew',
            [kind === 'test' ? 'test' : 'classes'],
        );
    }

    return undefined;
}

async function runQuality(
    project: ResolvedProject,
    kind: 'test' | 'typecheck' | 'lint',
): Promise<QualityResult> {
    let result: ProcessResult;
    let source: QualityResult['source'];

    if (project.config.commands[kind]) {
        result = await runTask(project, kind);
        source = 'task';
    } else {
        let scripts:
            | Awaited<ReturnType<typeof packageScripts>>
            | undefined;

        try {
            scripts = await packageScripts(project);
        } catch {
            scripts = undefined;
        }

        if (
            scripts &&
            Object.hasOwn(scripts.scripts, kind)
        ) {
            result = await packageRunScript(project, kind);
            source = 'package-script';
        } else {
            const fallback = await runLanguageDefault(project, kind);
            if (!fallback) {
                throw new Error(
                    `项目未定义 ${kind} 任务，也没有可识别的安全默认检查`,
                );
            }
            result = fallback;
            source = 'task';
        }
    }

    return {
        kind,
        source,
        success: result.code === 0 && !result.timedOut,
        code: result.code,
        timedOut: result.timedOut,
        stdout: result.stdout,
        stderr: result.stderr,
        diagnostics: diagnosticsFrom(result),
        diagnosticParser: 'heuristic',
    };
}

export async function testRun(
    runtime: DeveloperRuntime,
    project: ResolvedProject,
): Promise<QualityResult> {
    const result = await runQuality(project, 'test');
    getLastTestResults(runtime).set(
        project.record.name,
        result,
    );
    return result;
}

export function testFailures(
    runtime: DeveloperRuntime,
    project: ResolvedProject,
): QualityResult {
    const result = getLastTestResults(runtime).get(
        project.record.name,
    );
    if (!result) {
        throw new Error('当前 MCP 会话中还没有 test_run 结果');
    }
    return {
        ...result,
        stdout: '',
        diagnostics: result.diagnostics,
    };
}

export function typecheck(
    project: ResolvedProject,
): Promise<QualityResult> {
    return runQuality(project, 'typecheck');
}

export function lint(
    project: ResolvedProject,
): Promise<QualityResult> {
    return runQuality(project, 'lint');
}
