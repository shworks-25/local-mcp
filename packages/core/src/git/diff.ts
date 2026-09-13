import type {
    ResolvedProject,
} from '../project/resolver.js';

import {
    assertPermission,
    matchesAnyPattern,
} from '../security/permissions.js';

import {
    runGit,
} from './runner.js';

export interface GitDiffOptions {
    staged?: boolean;
}

export async function gitDiff(
    project: ResolvedProject,
    options: GitDiffOptions = {},
): Promise<string> {
    assertPermission(
        project.permissions,
        'read',
    );

    const baseArgs = [
        'diff',
    ];

    if (options.staged) {
        baseArgs.push(
            '--cached',
        );
    }

    /*
     * 第一步只获取发生变化的文件。
     */
    const names =
        await runGit(
            project,
            [
                ...baseArgs,
                '--name-only',
            ],
        );

    const files =
        names.stdout
            .split('\n')
            .filter(Boolean)
            .filter(
                (file) =>
                    !matchesAnyPattern(
                        file,
                        project.protectedPatterns,
                    ),
            );

    if (
        files.length === 0
    ) {
        return '';
    }

    const result =
        await runGit(
            project,
            [
                ...baseArgs,
                '--',
                ...files,
            ],
        );

    return result.stdout;
}
