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

export async function gitCommit(
    project: ResolvedProject,
    message: string,
): Promise<string> {
    assertPermission(
        project.permissions,
        'write',
    );

    const trimmed = message.trim();
    if (!trimmed) {
        throw new Error('提交信息不能为空');
    }

    const result = await runGit(
        project,
        [
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
