import type {
    McpServer,
} from '@modelcontextprotocol/server';

import * as z from 'zod/v4';

import {
    gitAdd,
    gitCommit,
    gitDiff,
    gitLog,
    gitPush,
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
        'git_add',
        {
            description:
                '将指定的安全项目路径加入 Git 暂存区',
            inputSchema:
                z.object({
                    project: z.string(),
                    paths: z.array(z.string().min(1)).min(1).max(100),
                }),
        },
        async ({ project, paths }) =>
            safeResult(
                async () => {
                    const resolved = await resolveProject(project);
                    return gitAdd(resolved, paths);
                },
                {
                    toolName: 'git_add',
                    params: { project, paths },
                },
            ),
    );

    server.registerTool(
        'git_commit',
        {
            description:
                '提交当前 Git 暂存区内容',
            inputSchema:
                z.object({
                    project: z.string(),
                    message: z.string().min(1).max(2000),
                }),
        },
        async ({ project, message }) =>
            safeResult(
                async () => {
                    const resolved = await resolveProject(project);
                    return gitCommit(resolved, message);
                },
                {
                    toolName: 'git_commit',
                    params: { project, message },
                },
            ),
    );

    server.registerTool(
        'git_push',
        {
            description:
                '将当前分支推送到 Git 远程仓库；默认 remote 为 origin',
            inputSchema:
                z.object({
                    project: z.string(),
                    remote: z.string().default('origin'),
                    branch: z.string().optional(),
                }),
        },
        async ({ project, remote, branch }) =>
            safeResult(
                async () => {
                    const resolved = await resolveProject(project);
                    return gitPush(resolved, remote, branch);
                },
                {
                    toolName: 'git_push',
                    params: { project, remote, branch },
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
