import type {
    ResolvedProject,
} from '../project/resolver.js';

import {
    runGit,
} from './runner.js';

export async function gitLog(
    project: ResolvedProject,
    limit = 20,
): Promise<string> {
    const safeLimit =
        Math.max(
            1,
            Math.min(
                limit,
                100,
            ),
        );

    const result =
        await runGit(
            project,
            [
                'log',
                `-${safeLimit}`,
                '--date=short',
                '--pretty=format:%h %ad %s',
            ],
        );

    return result.stdout;
}
