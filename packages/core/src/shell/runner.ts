import {
    constants,
} from 'node:fs';

import {
    access,
    realpath,
} from 'node:fs/promises';

import {
    basename,
    dirname,
    isAbsolute,
    join,
    relative,
} from 'node:path';

import type {
    ResolvedProject,
} from '../project/resolver.js';

import {
    resolvePathWithinRoot,
} from '../security/path-guard.js';

import {
    runProcess,
    type ProcessResult,
} from './process.js';

/**
 * 受信任的系统级标准可执行文件目录有序集合。
 * 用于在解析裸命令时提供确定性的安全搜索路径，根除 PATH 劫持隐患。
 */
const TRUSTED_SYSTEM_BIN_DIRS = [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
];

/**
 * 语言解释器及其禁止在 restricted 模式下携带的动态内联执行参数开关。
 */
const FORBIDDEN_INLINE_EVAL_FLAGS: Record<string, Set<string>> = {
    node: new Set([
        '-e',
        '--eval',
        '-p',
        '--print',
        '-r',
        '--require',
        '--import',
        '--loader',
        '--experimental-loader',
    ]),
    nodejs: new Set([
        '-e',
        '--eval',
        '-p',
        '--print',
        '-r',
        '--require',
        '--import',
        '--loader',
        '--experimental-loader',
    ]),
    php: new Set(['-r', '-a']),
    python: new Set(['-c']),
    python3: new Set(['-c']),
    ruby: new Set(['-e']),
    perl: new Set(['-e']),
    bash: new Set(['-c']),
    sh: new Set(['-c']),
    zsh: new Set(['-c']),
};

/**
 * 检查文件是否具备可执行权限。
 */
async function isExecutable(filePath: string): Promise<boolean> {
    try {
        await access(filePath, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * 在受信任的标准系统目录中安全决议裸命令或绝对路径。
 *
 * 核心目的：
 * 绝不依赖未经校验的宿主 PATH 环境变量，防止局部环境或项目目录中的恶意二进制被无意调用。
 */
async function resolveTrustedExecutable(
    program: string,
    cwd: string,
    allowedPrograms: string[],
    allowedProjectExecutables: string[],
): Promise<string> {
    if (program.startsWith('./') || program.startsWith('../')) {
        if (!allowedProjectExecutables.includes(program)) {
            throw new Error(
                `restricted 模式禁止执行未显式授权的项目脚本：${program}`,
            );
        }

        const localExecutable = await resolvePathWithinRoot(cwd, program);
        if (!(await isExecutable(localExecutable))) {
            throw new Error(`指定的项目内部脚本不可执行：${program}`);
        }
        return localExecutable;
    }

    if (isAbsolute(program)) {
        if (!allowedPrograms.includes(program)) {
            throw new Error(
                `restricted 模式禁止执行未显式授权的绝对路径程序：${program}`,
            );
        }
        const parent = dirname(program);
        if (!TRUSTED_SYSTEM_BIN_DIRS.includes(parent)) {
            throw new Error(
                `拒绝执行非系统受信任目录中的绝对路径程序：${program}`,
            );
        }
        if (!(await isExecutable(program))) {
            throw new Error(`程序不存在或无执行权限：${program}`);
        }
        return program;
    }

    if (!allowedPrograms.includes(program)) {
        throw new Error(
            `restricted 模式禁止执行程序：${program}`,
        );
    }

    for (const sysDir of TRUSTED_SYSTEM_BIN_DIRS) {
        const candidate = join(sysDir, program);
        if (await isExecutable(candidate)) {
            return candidate;
        }
    }

    throw new Error(
        `无法在系统受信任目录中找到已授权的可执行程序：${program}`,
    );
}

/**
 * 严密校验任务参数，杜绝 restricted 模式下的动态代码执行与越界脚本加载。
 */
const RESTRICTED_ENV_BLOCKLIST = new Set([
    'PATH',
    'NODE_PATH',
    'NODE_OPTIONS',
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'DYLD_INSERT_LIBRARIES',
    'DYLD_LIBRARY_PATH',
    'BASH_ENV',
    'ENV',
    'PYTHONPATH',
    'RUBYOPT',
    'PERL5OPT',
    'GIT_EXEC_PATH',
    'GIT_SSH',
    'GIT_SSH_COMMAND',
    'GIT_PAGER',
    'PAGER',
]);

function sanitizeRestrictedTaskEnv(
    env: Record<string, string>,
): Record<string, string> {
    return Object.fromEntries(
        Object.entries(env).filter(
            ([key]) =>
                !RESTRICTED_ENV_BLOCKLIST.has(
                    key.toUpperCase(),
                ),
        ),
    );
}

async function assertSafeTaskArguments(
    program: string,
    args: string[],
    projectRoot: string,
): Promise<void> {
    const base = basename(program);
    const forbiddenFlags = FORBIDDEN_INLINE_EVAL_FLAGS[base];

    if (forbiddenFlags) {
        for (const arg of args) {
            const matchedForbiddenFlag = [
                ...forbiddenFlags,
            ].some((flag) => {
                if (arg === flag) {
                    return true;
                }

                if (flag.startsWith('--')) {
                    return arg.startsWith(`${flag}=`);
                }

                return (
                    flag.length === 2 &&
                    arg.startsWith(flag) &&
                    arg.length > flag.length
                );
            });

            if (matchedForbiddenFlag) {
                throw new Error(
                    `restricted 模式禁止使用动态内联代码执行开关：${arg}`,
                );
            }
        }

        const scriptArg = args.find((arg) => !arg.startsWith('-'));
        if (scriptArg) {
            await resolvePathWithinRoot(projectRoot, scriptArg);
        }
    }
}

export async function runTask(
    project: ResolvedProject,
    taskName: string,
): Promise<ProcessResult> {
    if (project.permissions.shell === 'disabled') {
        throw new Error(
            '当前项目禁止执行命令',
        );
    }

    if (project.record.trusted === false) {
        throw new Error(
            `当前项目未被标记为可信，禁止自动执行任务：${taskName}`,
        );
    }

    const task = project.config.commands[taskName];

    if (!task) {
        throw new Error(
            `项目没有定义任务：${taskName}`,
        );
    }

    const realProjectRoot = await realpath(project.root);

    const cwd = await resolvePathWithinRoot(
        realProjectRoot,
        task.cwd,
    );

    const relativeCwd = relative(
        realProjectRoot,
        cwd,
    );

    if (relativeCwd.startsWith('..')) {
        throw new Error(
            '任务工作目录越界',
        );
    }

    let executablePath = task.program;

    if (project.permissions.shell === 'restricted') {
        executablePath = await resolveTrustedExecutable(
            task.program,
            cwd,
            project.globalConfig.allowedPrograms,
            project.globalConfig.allowedProjectExecutables,
        );

        await assertSafeTaskArguments(
            task.program,
            task.args,
            project.root,
        );
    }

    const taskEnv =
        project.permissions.shell === 'restricted'
            ? sanitizeRestrictedTaskEnv(task.env)
            : task.env;

    return runProcess(
        executablePath,
        task.args,
        {
            cwd,
            timeoutMs: task.timeoutMs,
            env: taskEnv,
        },
    );
}
