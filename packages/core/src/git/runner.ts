import type {
    ResolvedProject,
} from '../project/resolver.js';

import {
    runProcess,
    type ProcessResult,
} from '../shell/process.js';

export async function runGit(
    project: ResolvedProject,
    args: string[],
): Promise<ProcessResult> {
    const result =
        await runProcess(
            'git',
            [
                '-C',
                project.root,
                ...args,
            ],
            {
                timeoutMs:
                    30_000,
            },
        );

    if (
        result.code !== 0
    ) {
        throw new Error(
            result.stderr ||
            'git 命令执行失败',
        );
    }

    return result;
}
