import type {
    ResolvedProject,
} from '../project/resolver.js';

import {
    readTextFile,
} from './read.js';

import {
    writeTextFile,
} from './write.js';

export interface ReplaceTextOptions {
    expectedOccurrences?: number;
}

export async function replaceText(
    project: ResolvedProject,
    path: string,
    search: string,
    replacement: string,
    options: ReplaceTextOptions = {},
): Promise<void> {
    if (search.length === 0) {
        throw new Error(
            'search 不能为空',
        );
    }

    const file =
        await readTextFile(
            project,
            path,
            2_000_000,
        );

    const occurrences =
        file.content
            .split(search)
            .length - 1;

    const expected =
        options.expectedOccurrences ??
        1;

    if (
        occurrences !== expected
    ) {
        throw new Error(
            `文本匹配数量不符合预期：期望 ${expected}，实际 ${occurrences}`,
        );
    }

    const content =
        file.content.replaceAll(
            search,
            replacement,
        );

    await writeTextFile(
        project,
        path,
        content,
        {
            overwrite: true,
        },
    );
}
