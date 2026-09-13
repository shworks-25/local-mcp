import type {
    ResolvedProject,
} from '../project/resolver.js';

import {
    runGit,
} from './runner.js';

export async function gitBranch(
    project: ResolvedProject,
): Promise<string> {
    const result =
        await runGit(
            project,
            [
                'rev-parse',
                '--abbrev-ref',
                'HEAD',
            ],
        );

    return result.stdout.trim();
}
