import {
    access,
    realpath,
} from 'node:fs/promises';

import {
    dirname,
    isAbsolute,
    relative,
    resolve,
    sep,
} from 'node:path';

async function exists(
    file: string,
): Promise<boolean> {
    try {
        await access(file);
        return true;
    } catch {
        return false;
    }
}

function isWithinRoot(
    root: string,
    target: string,
): boolean {
    const result = relative(
        root,
        target,
    );

    if (result === '') {
        return true;
    }

    if (result === '..') {
        return false;
    }

    if (result.startsWith(`..${sep}`)) {
        return false;
    }

    return !isAbsolute(result);
}

async function findExistingAncestor(
    target: string,
): Promise<string> {
    let current = target;

    while (true) {
        if (await exists(current)) {
            return current;
        }

        const parent = dirname(current);

        if (parent === current) {
            throw new Error(
                `无法找到路径的有效父目录：${target}`,
            );
        }

        current = parent;
    }
}

export interface ResolvePathOptions {
    allowMissing?: boolean;
}

/**
 * 将用户提交的路径限制在项目根目录中。
 *
 * 同时处理：
 * - ../ 逃逸
 * - 绝对路径逃逸
 * - symlink 跳出项目目录
 */
export async function resolvePathWithinRoot(
    root: string,
    requestedPath: string,
    options: ResolvePathOptions = {},
): Promise<string> {
    const realRoot = await realpath(root);

    const candidate = isAbsolute(
        requestedPath,
    )
        ? resolve(requestedPath)
        : resolve(
            realRoot,
            requestedPath,
        );

    if (
        !isWithinRoot(
            realRoot,
            candidate,
        )
    ) {
        throw new Error(
            `拒绝访问项目目录以外的路径：${requestedPath}`,
        );
    }

    const candidateExists =
        await exists(candidate);

    if (candidateExists) {
        const realCandidate =
            await realpath(candidate);

        if (
            !isWithinRoot(
                realRoot,
                realCandidate,
            )
        ) {
            throw new Error(
                `检测到符号链接逃逸：${requestedPath}`,
            );
        }

        return realCandidate;
    }

    if (!options.allowMissing) {
        throw new Error(
            `文件不存在：${requestedPath}`,
        );
    }

    /*
     * 写入不存在的文件时，还需要检查它最近的
     * 已存在父目录是不是 symlink 到项目之外。
     */
    const ancestor =
        await findExistingAncestor(
            candidate,
        );

    const realAncestor =
        await realpath(ancestor);

    if (
        !isWithinRoot(
            realRoot,
            realAncestor,
        )
    ) {
        throw new Error(
            `目标文件的父目录位于项目之外：${requestedPath}`,
        );
    }

    return candidate;
}
