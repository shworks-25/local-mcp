import {
    basename,
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

function programAllowed(
    program: string,
    allowedPrograms: string[],
): boolean {
    return allowedPrograms.some(
        (allowed) =>
            allowed === program ||
            allowed === basename(program),
    );
}

export async function runTask(
    project: ResolvedProject,
    taskName: string,
): Promise<ProcessResult> {
    if (
        project.permissions.shell ===
        'disabled'
    ) {
        throw new Error(
            '当前项目禁止执行命令',
        );
    }

    const task =
        project.config.commands[
            taskName
            ];

    if (!task) {
        throw new Error(
            `项目没有定义任务：${taskName}`,
        );
    }

    if (
        project.permissions.shell ===
        'restricted' &&
        !programAllowed(
            task.program,
            project.globalConfig
                .allowedPrograms,
        )
    ) {
        throw new Error(
            `restricted 模式禁止执行程序：${task.program}`,
        );
    }

    const cwd =
        await resolvePathWithinRoot(
            project.root,
            task.cwd,
        );

    const relativeCwd =
        relative(
            project.root,
            cwd,
        );

    if (
        relativeCwd.startsWith('..')
    ) {
        throw new Error(
            '任务工作目录越界',
        );
    }

    return runProcess(
        task.program,
        task.args,
        {
            cwd,
            timeoutMs:
            task.timeoutMs,
        },
    );
}
