import {
    readdir,
    stat,
} from 'node:fs/promises';

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
    assertNotProtected,
    matchesAnyPattern,
} from '../security/permissions.js';

export async function directoryTree(
    project: ResolvedProject,
    requestedPath = '.',
    maxDepth = 4,
): Promise<string> {
    const root =
        await resolvePathWithinRoot(
            project.root,
            requestedPath,
        );

    const relativeRoot =
        relative(
            project.root,
            root,
        ).replaceAll(
            '\\',
            '/',
        );

    if (relativeRoot) {
        assertNotProtected(
            relativeRoot,
            project.protectedPatterns,
        );
    }

    const info =
        await stat(root);

    if (!info.isDirectory()) {
        return basename(root);
    }

    const lines: string[] = [
        relativeRoot || '.',
    ];

    async function walk(
        current: string,
        prefix: string,
        depth: number,
    ): Promise<void> {
        if (depth >= maxDepth) {
            return;
        }

        let entries =
            await readdir(
                current,
                {
                    withFileTypes: true,
                },
            );

        entries = entries.sort(
            (a, b) => {
                if (
                    a.isDirectory() !==
                    b.isDirectory()
                ) {
                    return a.isDirectory()
                        ? -1
                        : 1;
                }

                return a.name.localeCompare(
                    b.name,
                );
            },
        );

        const visible =
            entries.filter(
                (entry) => {
                    const absolute =
                        `${current}/${entry.name}`;

                    const rel =
                        relative(
                            project.root,
                            absolute,
                        ).replaceAll(
                            '\\',
                            '/',
                        );

                    return !matchesAnyPattern(
                        rel,
                        [
                            ...project.ignorePatterns,
                            ...project.protectedPatterns,
                        ],
                    );
                },
            );

        for (
            let index = 0;
            index < visible.length;
            index++
        ) {
            const entry =
                visible[index]!;

            const last =
                index ===
                visible.length - 1;

            const branch =
                last
                    ? '└── '
                    : '├── ';

            lines.push(
                `${prefix}${branch}${entry.name}`,
            );

            if (
                entry.isDirectory()
            ) {
                await walk(
                    `${current}/${entry.name}`,
                    `${prefix}${last ? '    ' : '│   '}`,
                    depth + 1,
                );
            }

            /*
             * symlink 不继续递归。
             */
        }
    }

    await walk(
        root,
        '',
        0,
    );

    return lines.join('\n');
}
