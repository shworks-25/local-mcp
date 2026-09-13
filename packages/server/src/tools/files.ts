import type {
    McpServer,
} from '@modelcontextprotocol/server';

import * as z from 'zod/v4';

import {
    directoryTree,
    readTextFile,
    readTextFiles,
    replaceText,
    resolveProject,
    searchText,
    writeTextFile,
} from '@shworks/local-core';

import {
    safeResult,
} from '../result.js';

export function registerFileTools(
    server: McpServer,
): void {
    server.registerTool(
        'read_file',
        {
            description:
                '读取项目中的文本文件',

            inputSchema:
                z.object({
                    project:
                        z.string(),

                    path:
                        z.string(),
                }),
        },
        async ({
                   project,
                   path,
               }) =>
            safeResult(
                async () => {
                    const resolved =
                        await resolveProject(
                            project,
                        );

                    return readTextFile(
                        resolved,
                        path,
                    );
                },
            ),
    );

    server.registerTool(
        'read_files',
        {
            description:
                '批量读取项目文件，一次最多 20 个',

            inputSchema:
                z.object({
                    project:
                        z.string(),

                    paths:
                        z
                            .array(
                                z.string(),
                            )
                            .min(1)
                            .max(20),
                }),
        },
        async ({
                   project,
                   paths,
               }) =>
            safeResult(
                async () => {
                    const resolved =
                        await resolveProject(
                            project,
                        );

                    return readTextFiles(
                        resolved,
                        paths,
                    );
                },
            ),
    );

    server.registerTool(
        'search_text',
        {
            description:
                '使用 ripgrep 在项目中搜索代码',

            inputSchema:
                z.object({
                    project:
                        z.string(),

                    query:
                        z.string().min(1),

                    maxResults:
                        z
                            .number()
                            .int()
                            .min(1)
                            .max(500)
                            .default(100),
                }),
        },
        async ({
                   project,
                   query,
                   maxResults,
               }) =>
            safeResult(
                async () => {
                    const resolved =
                        await resolveProject(
                            project,
                        );

                    return searchText(
                        resolved,
                        query,
                        maxResults,
                    );
                },
            ),
    );

    server.registerTool(
        'directory_tree',
        {
            description:
                '查看项目目录结构',

            inputSchema:
                z.object({
                    project:
                        z.string(),

                    path:
                        z.string()
                            .default('.'),

                    depth:
                        z
                            .number()
                            .int()
                            .min(1)
                            .max(10)
                            .default(4),
                }),
        },
        async ({
                   project,
                   path,
                   depth,
               }) =>
            safeResult(
                async () => {
                    const resolved =
                        await resolveProject(
                            project,
                        );

                    return directoryTree(
                        resolved,
                        path,
                        depth,
                    );
                },
            ),
    );

    server.registerTool(
        'write_file',
        {
            description:
                '在项目内创建或覆盖文本文件',

            inputSchema:
                z.object({
                    project:
                        z.string(),

                    path:
                        z.string(),

                    content:
                        z.string(),

                    overwrite:
                        z.boolean()
                            .default(false),
                }),
        },
        async ({
                   project,
                   path,
                   content,
                   overwrite,
               }) =>
            safeResult(
                async () => {
                    const resolved =
                        await resolveProject(
                            project,
                        );

                    await writeTextFile(
                        resolved,
                        path,
                        content,
                        {
                            overwrite,
                        },
                    );

                    return {
                        success: true,
                        path,
                    };
                },
            ),
    );

    server.registerTool(
        'replace_text',
        {
            description:
                '对文件进行精确文本替换，比重写整个文件更安全',

            inputSchema:
                z.object({
                    project:
                        z.string(),

                    path:
                        z.string(),

                    search:
                        z.string().min(1),

                    replacement:
                        z.string(),

                    expectedOccurrences:
                        z
                            .number()
                            .int()
                            .min(1)
                            .default(1),
                }),
        },
        async ({
                   project,
                   path,
                   search,
                   replacement,
                   expectedOccurrences,
               }) =>
            safeResult(
                async () => {
                    const resolved =
                        await resolveProject(
                            project,
                        );

                    await replaceText(
                        resolved,
                        path,
                        search,
                        replacement,
                        {
                            expectedOccurrences,
                        },
                    );

                    return {
                        success: true,
                        path,
                    };
                },
            ),
    );
}
