import {
    basename,
} from 'node:path';

import type {
    GlobalConfig,
    Permissions,
    ProjectConfig,
} from '../config/schema.js';

const SHELL_MODE_RANK = {
    disabled: 0,
    restricted: 1,
    unrestricted: 2,
} as const;

export function mergePermissions(
    globalConfig: GlobalConfig,
    projectConfig: ProjectConfig,
): Permissions {
    const requestedShell =
        projectConfig.permissions.shell ??
        globalConfig.permissions.shell;

    const shell =
        SHELL_MODE_RANK[requestedShell] <
        SHELL_MODE_RANK[globalConfig.permissions.shell]
            ? requestedShell
            : globalConfig.permissions.shell;

    return {
        read:
            globalConfig.permissions.read &&
            (projectConfig.permissions.read ?? true),

        write:
            globalConfig.permissions.write &&
            (projectConfig.permissions.write ?? true),

        delete:
            globalConfig.permissions.delete &&
            (projectConfig.permissions.delete ?? true),

        shell,
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

/**
 * 判断路径是否最终属于受保护集合，并支持 gitignore 风格的 `!` 显式例外规则。
 *
 * 规则按声明顺序处理：普通规则命中后将路径标记为 protected；以 `!` 开头的规则
 * 命中后取消 protected。后续规则仍可再次覆盖前面的结果，因此配置文件能够表达
 * “默认保护一类文件，但明确开放安全模板”的策略，例如：
 *
 *   .env.*
 *   !.env.example
 *
 * 此时 .env.production 仍受保护，而 .env.example 可由文件/Git 工具正常维护。
 * `!` 只作为 matchesAnyPattern 的策略操作符；matchesPattern 本身继续负责纯 glob 匹配。
 */
export function matchesAnyPattern(
    file: string,
    patterns: string[],
): boolean {
    let protectedMatch = false;

    for (const rawPattern of patterns) {
        const isException = rawPattern.startsWith('!');
        const pattern = isException
            ? rawPattern.slice(1)
            : rawPattern;

        // 空的 `!` 没有合法匹配目标，直接忽略，避免把它解释成全局例外。
        if (!pattern) {
            continue;
        }

        if (matchesPattern(file, pattern)) {
            protectedMatch = !isException;
        }
    }

    return protectedMatch;
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
