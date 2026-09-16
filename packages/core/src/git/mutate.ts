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

function assertSafePath(
    project: ResolvedProject,
    path: string,
): void {
    if (
        !path ||
        path === '.' ||
        path === './' ||
        path === '*' ||
        path.startsWith('-') ||
        path.startsWith(':(') ||
        path.startsWith('/') ||
        path.includes('..') ||
        matchesAnyPattern(
            path,
            project.protectedPatterns,
        )
    ) {
        throw new Error(
            `拒绝暂存不安全或受保护路径：${path}`,
        );
    }
}

export async function gitAdd(
    project: ResolvedProject,
    paths: string[],
): Promise<string> {
    assertPermission(
        project.permissions,
        'write',
    );

    if (paths.length === 0) {
        throw new Error('至少需要一个待暂存路径');
    }

    for (const path of paths) {
        assertSafePath(project, path);
    }

    await runGit(
        project,
        [
            'add',
            '--',
            ...paths,
        ],
    );

    return `已暂存 ${paths.length} 个路径`;
}

/**
 * 创建 Git commit。
 *
 * paths 为空/未传时保持传统行为：提交当前整个 index。
 * paths 有值时使用 `git commit -m <message> -- <paths...>`，只提交明确指定的路径，
 * 即使 index 中还暂存着其他文件，也不会把它们意外带入本次 commit。
 *
 * 路径复用 git_add 的安全边界：禁止绝对路径、..、Git magic pathspec、以 `-` 开头
 * 的 option 注入以及 protected 文件。`--` 同时明确结束 Git options。
 */
export async function gitCommit(
    project: ResolvedProject,
    message: string,
    paths?: string[],
): Promise<string> {
    assertPermission(
        project.permissions,
        'write',
    );

    const trimmed = message.trim();
    if (!trimmed) {
        throw new Error('提交信息不能为空');
    }

    if (paths) {
        if (paths.length === 0) {
            throw new Error('paths 存在时至少需要一个待提交路径');
        }
        for (const path of paths) {
            assertSafePath(project, path);
        }
    }

    const result = await runGit(
        project,
        paths
            ? [
                'commit',
                '-m',
                trimmed,
                '--',
                ...paths,
            ]
            : [
                'commit',
                '-m',
                trimmed,
            ],
    );

    return result.stdout.trim();
}

export async function gitPush(
    project: ResolvedProject,
    remote = 'origin',
    branch?: string,
): Promise<string> {
    assertPermission(
        project.permissions,
        'write',
    );

    const safeName = /^[A-Za-z0-9._/-]+$/;
    if (
        remote.startsWith('-') ||
        (branch && branch.startsWith('-'))
    ) {
        throw new Error(
            'remote 或 branch 名称不能以 "-" 开头',
        );
    }
    if (!safeName.test(remote)) {
        throw new Error('remote 名称不合法');
    }
    if (branch && !safeName.test(branch)) {
        throw new Error('branch 名称不合法');
    }

    const result = await runGit(
        project,
        branch
            ? ['push', remote, '--', branch]
            : ['push', remote],
    );

    return (result.stdout || result.stderr).trim();
}
