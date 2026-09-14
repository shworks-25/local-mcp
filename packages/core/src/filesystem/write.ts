import {
    constants,
} from 'node:fs';

import {
    mkdir,
    open,
} from 'node:fs/promises';

import {
    basename,
    dirname,
    join,
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
    if (!project.record.trusted) {
        throw new Error(
            '未受信任项目为只读模式，禁止写入文件',
        );
    }

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

    /*
     * mkdir 之后再次解析真实父目录，缩短检查与写入之间的竞争窗口。
     * 最终文件通过 O_NOFOLLOW 打开，拒绝在最后一跳跟随 symlink。
     */
    const verifiedParent =
        await resolvePathWithinRoot(
            project.root,
            dirname(file),
        );

    const verifiedFile =
        join(
            verifiedParent,
            basename(file),
        );

    const flags =
        constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_NOFOLLOW |
        (options.overwrite
            ? constants.O_TRUNC
            : constants.O_EXCL);

    const handle =
        await open(
            verifiedFile,
            flags,
            0o666,
        );

    try {
        await handle.writeFile(
            content,
            {
                encoding: 'utf8',
            },
        );
    } finally {
        await handle.close();
    }
}
