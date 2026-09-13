import type {
    ResolvedProject,
} from '../project/resolver.js';

import {
    runProcess,
} from '../shell/process.js';

function exclusionGlobs(
    pattern: string,
): string[] {
    const normalized =
        pattern.replaceAll(
            '\\',
            '/',
        );

    if (
        normalized.includes('/')
    ) {
        return [
            `!${normalized}`,
        ];
    }

    if (
        normalized.includes('*') ||
        normalized.includes('?')
    ) {
        return [
            `!**/${normalized}`,
        ];
    }

    return [
        `!**/${normalized}`,
        `!**/${normalized}/**`,
    ];
}

export interface SearchResult {
    output: string[];

    truncated: boolean;
}

export async function searchText(
    project: ResolvedProject,
    query: string,
    maxResults = 100,
): Promise<SearchResult> {
    if (
        !project.permissions.read
    ) {
        throw new Error(
            '当前项目禁止读取文件',
        );
    }

    if (!query.trim()) {
        throw new Error(
            '搜索内容不能为空',
        );
    }

    const args = [
        '--line-number',
        '--column',
        '--no-heading',
        '--hidden',
        '--color',
        'never',
    ];

    const excluded = [
        ...project.ignorePatterns,
        ...project.protectedPatterns,
    ];

    for (const pattern of excluded) {
        for (
            const glob
            of exclusionGlobs(
            pattern,
        )
            ) {
            args.push(
                '--glob',
                glob,
            );
        }
    }

    args.push(
        '--',
        query,
        '.',
    );

    const result =
        await runProcess(
            'rg',
            args,
            {
                cwd:
                project.root,
                timeoutMs:
                    30_000,
            },
        );

    /*
     * rg:
     * 0 = 有匹配
     * 1 = 没有匹配
     * >1 = 错误
     */
    if (
        result.code > 1
    ) {
        throw new Error(
            result.stderr ||
            'ripgrep 搜索失败',
        );
    }

    const lines: string[] = [];
    let truncated = false;
    let startIndex = 0;

    while (startIndex < result.stdout.length) {
        const nextNewline =
            result.stdout.indexOf('\n', startIndex);
        const line =
            nextNewline === -1
                ? result.stdout.slice(startIndex)
                : result.stdout.slice(startIndex, nextNewline);

        if (line.length > 0) {
            if (lines.length >= maxResults) {
                truncated = true;
                break;
            }
            lines.push(line);
        }

        if (nextNewline === -1) {
            break;
        }
        startIndex = nextNewline + 1;
    }

    return {
        output: lines,
        truncated,
    };
}
