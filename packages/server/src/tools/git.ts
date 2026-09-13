import type {
    McpServer,
} from '@modelcontextprotocol/server';

import * as z from 'zod/v4';

import {
    gitDiff,
    gitLog,
    gitStatus,
    resolveProject,
} from '@shworks/local-core';

import {
    safeResult,
} from '../result.js';

export function registerGitTools(
    server: McpServer,
): void {
    server.registerTool(
        'git_status',
        {
            description:
                '查看项目 Git 状态',

            inputSchema:
                z.object({
                    project:
                        z.string(),
                }),
        },
        async ({
                   project,
               }) =>
            safeResult(
                async () => {
                    const resolved =
                        await resolveProject(
                            project,
                        );

                    return gitStatus(
                        resolved,
                    );
                },
            ),
    );

    server.registerTool(
        'git_diff',
        {
            description:
                '查看项目 Git diff，自动排除受保护文件',

            inputSchema:
                z.object({
                    project:
                        z.string(),

                    staged:
                        z.boolean()
                            .default(false),
                }),
        },
        async ({
                   project,
                   staged,
               }) =>
            safeResult(
                async () => {
                    const resolved =
                        await resolveProject(
                            project,
                        );

                    return gitDiff(
                        resolved,
                        {
                            staged,
                        },
                    );
                },
            ),
    );

    server.registerTool(
        'git_log',
        {
            description:
                '查看最近 Git 提交记录',

            inputSchema:
                z.object({
                    project:
                        z.string(),

                    limit:
                        z
                            .number()
                            .int()
                            .min(1)
                            .max(100)
                            .default(20),
                }),
        },
        async ({
                   project,
                   limit,
               }) =>
            safeResult(
                async () => {
                    const resolved =
                        await resolveProject(
                            project,
                        );

                    return gitLog(
                        resolved,
                        limit,
                    );
                },
            ),
    );
}
