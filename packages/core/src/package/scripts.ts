import {
    access,
} from 'node:fs/promises';
import {
    join,
} from 'node:path';

import type {
    ResolvedProject,
} from '../project/resolver.js';
import {
    readTextFile,
} from '../filesystem/read.js';
import {
    runTask,
    type ProcessResult,
} from '../shell/runner.js';

export interface PackageScriptsResult {
    manager: 'pnpm' | 'yarn' | 'npm';
    scripts: Record<string, string>;
}

async function exists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

async function detectPackageManager(
    project: ResolvedProject,
): Promise<'pnpm' | 'yarn' | 'npm'> {
    if (await exists(join(project.root, 'pnpm-lock.yaml'))) {
        return 'pnpm';
    }
    if (await exists(join(project.root, 'yarn.lock'))) {
        return 'yarn';
    }
    return 'npm';
}

export async function packageScripts(
    project: ResolvedProject,
): Promise<PackageScriptsResult> {
    const packageJson =
        await readTextFile(
            project,
            'package.json',
            500_000,
        );

    const parsed = JSON.parse(packageJson.content) as {
        scripts?: Record<string, string>;
    };

    return {
        manager: await detectPackageManager(project),
        scripts: parsed.scripts ?? {},
    };
}

const FORBIDDEN_PACKAGE_SCRIPT_FLAGS = new Set([
    '-e',
    '--eval',
    '-p',
    '--print',
    '-r',
    '--require',
    '--import',
    '--loader',
    '--experimental-loader',
    '-c',
]);

/**
 * 校验透传给包管理器脚本的额外参数。
 *
 * 核心目的：
 * 防止调用方借助 npm/pnpm/yarn 的 '--' 参数向底层解释器注入内联求值参数，
 * 消除 restricted 模式下动态执行代码的逃逸路径。
 */
function assertSafePackageScriptArgs(
    project: ResolvedProject,
    args: string[],
): void {
    if (project.permissions.shell !== 'restricted') {
        return;
    }

    for (const arg of args) {
        const isForbidden =
            FORBIDDEN_PACKAGE_SCRIPT_FLAGS.has(arg) ||
            [...FORBIDDEN_PACKAGE_SCRIPT_FLAGS].some(
                (flag) =>
                    flag.startsWith('--') &&
                    arg.startsWith(`${flag}=`),
            );

        if (isForbidden) {
            throw new Error(
                `restricted 模式禁止向包脚本透传动态代码执行参数：${arg}`,
            );
        }
    }
}

export async function packageRunScript(
    project: ResolvedProject,
    script: string,
    args: string[] = [],
    timeoutMs = 120_000,
): Promise<ProcessResult> {
    assertSafePackageScriptArgs(project, args);

    const info = await packageScripts(project);

    if (!Object.hasOwn(info.scripts, script)) {
        throw new Error(`package.json 中不存在脚本：${script}`);
    }

    const syntheticTask = '__package_run_script__';
    const cloned: ResolvedProject = {
        ...project,
        config: {
            ...project.config,
            commands: {
                ...project.config.commands,
                [syntheticTask]: {
                    program: info.manager,
                    args: [
                        'run',
                        script,
                        ...(args.length > 0
                            ? ['--', ...args]
                            : []),
                    ],
                    cwd: '.',
                    env: {},
                    timeoutMs,
                },
            },
        },
    };

    return runTask(
        cloned,
        syntheticTask,
    );
}
