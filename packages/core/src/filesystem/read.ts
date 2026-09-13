import {
    readFile,
    stat,
} from 'node:fs/promises';

import {
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

export interface ReadFileResult {
    path: string;

    content: string;

    size: number;
}

export async function readTextFile(
    project: ResolvedProject,
    requestedPath: string,
    maxBytes = 1_000_000,
): Promise<ReadFileResult> {
    assertPermission(
        project.permissions,
        'read',
    );

    const file =
        await resolvePathWithinRoot(
            project.root,
            requestedPath,
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
        project.protectedPatterns,
    );

    const information =
        await stat(file);

    if (!information.isFile()) {
        throw new Error(
            `${requestedPath} 不是文件`,
        );
    }

    if (
        information.size >
        maxBytes
    ) {
        throw new Error(
            `文件过大：${information.size} bytes，最大允许 ${maxBytes} bytes`,
        );
    }

    const buffer =
        await readFile(file);

    /*
     * 简单判断二进制文件。
     */
    if (
        buffer.includes(0)
    ) {
        throw new Error(
            '暂不支持读取二进制文件',
        );
    }

    return {
        path:
        relativePath,
        content:
            buffer.toString(
                'utf8',
            ),
        size:
        information.size,
    };
}

export async function readTextFiles(
    project: ResolvedProject,
    requestedPaths: string[],
): Promise<ReadFileResult[]> {
    if (
        requestedPaths.length > 20
    ) {
        throw new Error(
            '一次最多读取 20 个文件',
        );
    }

    return Promise.all(
        requestedPaths.map(
            (file) =>
                readTextFile(
                    project,
                    file,
                ),
        ),
    );
}
