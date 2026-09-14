import type {
    ResolvedProject,
} from '../project/resolver.js';

import {
    runProcess,
    type ProcessResult,
} from '../shell/process.js';
import {
    resolveTrustedSystemExecutable,
} from '../shell/runner.js';

export async function runGit(
    project: ResolvedProject,
    args: string[],
): Promise<ProcessResult> {
    const git =
        await resolveTrustedSystemExecutable(
            'git',
        );

    const result =
        await runProcess(
            git,
            [
                '-c',
                'core.fsmonitor=false',
                '-c',
                'diff.external=',
                '-c',
                'core.pager=cat',
                '--no-pager',
                '-C',
                project.root,
                ...args,
            ],
            {
                timeoutMs:
                    30_000,
                env: {
                    GIT_TERMINAL_PROMPT: '0',
                    GIT_ASKPASS: '',
                },
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
