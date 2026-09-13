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

/**
 * 注册 Git 操作相关 MCP 工具。
 *
 * 目的在于向模型暴露安全受控的代码版本管理查询能力，包括分支状态、工作区差异与提交历史。
 */
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
                {
                    toolName: 'git_status',
                    params: { project },
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
                {
                    toolName: 'git_diff',
                    params: { project, staged },
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
                {
                    toolName: 'git_log',
                    params: { project, limit },
                },
            ),
    );
}
