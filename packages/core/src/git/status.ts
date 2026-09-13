import type {
    ResolvedProject,
} from '../project/resolver.js';

import {
    matchesAnyPattern,
} from '../security/permissions.js';

import {
    runGit,
} from './runner.js';

export async function gitStatus(
    project: ResolvedProject,
): Promise<string> {
    const result =
        await runGit(
            project,
            [
                'status',
                '--short',
                '--branch',
            ],
        );

    const lines =
        result.stdout
            .split('\n')
            .filter(Boolean);

    const filtered =
        lines.filter(
            (line) => {
                if (
                    line.startsWith(
                        '##',
                    )
                ) {
                    return true;
                }

                const rawPath =
                    line
                        .slice(3)
                        .trim();

                const path =
                    rawPath.includes(
                        ' -> ',
                    )
                        ? rawPath
                            .split(
                                ' -> ',
                            )
                            .at(-1)!
                        : rawPath;

                return !matchesAnyPattern(
                    path,
                    project.protectedPatterns,
                );
            },
        );

    return filtered.join('\n');
}
