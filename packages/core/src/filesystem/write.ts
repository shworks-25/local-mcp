import {
    mkdir,
    writeFile,
} from 'node:fs/promises';

import {
    dirname,
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
    assertPermission,
} from '../security/permissions.js';

export interface WriteFileOptions {
    overwrite?: boolean;
}

export async function writeTextFile(
    project: ResolvedProject,
    requestedPath: string,
    content: string,
    options: WriteFileOptions = {},
): Promise<void> {
    assertPermission(
        project.permissions,
        'write',
    );

    const file =
        await resolvePathWithinRoot(
            project.root,
            requestedPath,
            {
                allowMissing: true,
            },
        );

    const relativePath =
        relative(
            project.root,
            file,
        ).replaceAll(
            '\\',
            '/',
        );

    assertNotProtected(
        relativePath,
        [
            ...project.protectedPatterns,
            ...project.ignorePatterns,
        ],
    );

    await mkdir(
        dirname(file),
        {
            recursive: true,
        },
    );

    await writeFile(
        file,
        content,
        {
            encoding: 'utf8',

            /*
             * wx = 文件存在则报错
             * w  = 覆盖
             */
            flag:
                options.overwrite
                    ? 'w'
                    : 'wx',
        },
    );
}
