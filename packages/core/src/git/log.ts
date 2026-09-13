import type {
    ResolvedProject,
} from '../project/resolver.js';

import {
    assertPermission,
} from '../security/permissions.js';

import {
    runGit,
} from './runner.js';

export async function gitLog(
    project: ResolvedProject,
    limit = 20,
): Promise<string> {
    assertPermission(
        project.permissions,
        'read',
    );

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
