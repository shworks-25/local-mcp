import type {
    ResolvedProject,
} from '../project/resolver.js';

import {
    searchText,
} from '../filesystem/search.js';

export interface SymbolMatch {
    path: string;
    line: number;
    column: number;
    text: string;
}

function parseRgLine(
    line: string,
): SymbolMatch | undefined {
    const match =
        line.match(
            /^(.+?):(\d+):(\d+):(.*)$/,
        );

    if (!match) {
        return undefined;
    }

    return {
        path: match[1]!,
        line: Number(match[2]),
        column: Number(match[3]),
        text: match[4]!.trim(),
    };
}

function escapeRegex(
    value: string,
): string {
    const special =
        new Set([
            '.', '*', '+', '?',
            '^', '$', '{', '}',
            '(', ')', '|', '[',
            ']', '\\',
        ]);

    return [...value]
        .map((character) =>
            special.has(character)
                ? `\\${character}`
                : character,
        )
        .join('');
}

export async function symbolReferences(
    project: ResolvedProject,
    symbol: string,
    maxResults = 200,
): Promise<SymbolMatch[]> {
    const query =
        `\\b${escapeRegex(symbol)}\\b`;

    const result =
        await searchText(
            project,
            query,
            maxResults,
        );

    return result.output
        .map(parseRgLine)
        .filter(
            (item): item is SymbolMatch =>
                Boolean(item),
        );
}

/**
 * 跨语言启发式查找代码符号的可能定义位置。
 *
 * 核心目的：
 * 合并主流编程语言（TS/JS/Go/Python/Rust/Swift/Kotlin等）的声明特征字，
 * 通过单次统一的正则匹配替代多次全量磁盘检索，降低 I/O 开销并扩充关键字覆盖。
 */
export async function symbolDefinition(
    project: ResolvedProject,
    symbol: string,
    maxResults = 50,
): Promise<SymbolMatch[]> {
    const escaped = escapeRegex(symbol);

    const definitionKeywords = [
        'function',
        'class',
        'interface',
        'type',
        'enum',
        'const',
        'let',
        'var',
        'func',
        'def',
        'fn',
        'struct',
        'protocol',
        'extension',
        'actor',
        'record',
    ].join('|');

    const pattern =
        `\\b(?:${definitionKeywords})\\s+${escaped}\\b`;

    const result = await searchText(
        project,
        pattern,
        maxResults,
    );

    const matches: SymbolMatch[] = [];
    const seen = new Set<string>();

    for (const line of result.output) {
        const parsed = parseRgLine(line);
        if (!parsed) {
            continue;
        }

        const key = `${parsed.path}:${parsed.line}:${parsed.column}`;
        if (!seen.has(key)) {
            seen.add(key);
            matches.push(parsed);
        }

        if (matches.length >= maxResults) {
            break;
        }
    }

    return matches;
}
