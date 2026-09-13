import {
    basename,
} from 'node:path';

import type {
    GlobalConfig,
    Permissions,
    ProjectConfig,
} from '../config/schema.js';

export function mergePermissions(
    globalConfig: GlobalConfig,
    projectConfig: ProjectConfig,
): Permissions {
    return {
        read:
            projectConfig.permissions.read ??
            globalConfig.permissions.read,

        write:
            projectConfig.permissions.write ??
            globalConfig.permissions.write,

        delete:
            projectConfig.permissions.delete ??
            globalConfig.permissions.delete,

        shell:
            projectConfig.permissions.shell ??
            globalConfig.permissions.shell,
    };
}

export function assertPermission(
    permissions: Permissions,
    action:
        | 'read'
        | 'write'
        | 'delete',
): void {
    if (!permissions[action]) {
        throw new Error(
            `当前项目未授权 ${action} 权限`,
        );
    }
}

function globToRegExp(
    input: string,
): RegExp {
    let source = input
        .replace(
            /[.+^${}()|[\]\\]/g,
            '\\$&',
        );

    source = source
        .replace(/\*\*/g, '__DOUBLE_STAR__')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '[^/]')
        .replace(
            /__DOUBLE_STAR__/g,
            '.*',
        );

    return new RegExp(
        `^${source}$`,
    );
}

export function matchesPattern(
    file: string,
    pattern: string,
): boolean {
    const normalized =
        file.replaceAll('\\', '/');

    const normalizedPattern =
        pattern.replaceAll('\\', '/');

    const regexp =
        globToRegExp(
            normalizedPattern,
        );

    if (
        normalizedPattern.includes('/')
    ) {
        return regexp.test(normalized);
    }

    /*
     * 没有 / 的规则同时匹配路径中的任意 segment。
     *
     * node_modules
     * *.pem
     * .env
     */
    const segments =
        normalized.split('/');

    return segments.some(
        (segment) =>
            regexp.test(segment),
    );
}

export function matchesAnyPattern(
    file: string,
    patterns: string[],
): boolean {
    return patterns.some(
        (pattern) =>
            matchesPattern(
                file,
                pattern,
            ),
    );
}

export function assertNotProtected(
    relativePath: string,
    patterns: string[],
): void {
    if (
        matchesAnyPattern(
            relativePath,
            patterns,
        )
    ) {
        throw new Error(
            `该文件属于受保护文件，拒绝访问：${basename(relativePath)}`,
        );
    }
}
