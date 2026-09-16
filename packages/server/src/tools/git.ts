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
    runOperation,
    type DeveloperRuntime,
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
    runtime: DeveloperRuntime,
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
                async () => runOperation(
                    runtime,
                    { tool: 'git_add', project },
                    async (operation) => {
                        const resolved = await operation.step(
                            'resolve_project',
                            () => resolveProject(project),
                            '解析并加载已注册项目',
                        );
                        const result = await gitAdd(resolved, paths, operation);
                        return { result, summary: { pathCount: paths.length } };
                    },
                ),
                {
                    toolName: 'git_add',
                    // 只记录路径数量；具体路径已经保存在 Git 工作区，不需要复制进通用日志。
                    params: { project, pathCount: paths.length },
                },
            ),
    );

    server.registerTool(
        'git_commit',
        {
            description:
                '创建 Git commit；可通过 paths 仅提交指定安全路径，省略 paths 时提交整个暂存区',
            inputSchema:
                z.object({
                    project: z.string(),
                    message: z.string().min(1).max(2000),
                    /**
                     * 可选 pathspec 白名单。传入后底层使用 `--` 分隔参数并逐项执行安全检查，
                     * 从而只提交这些路径，不会把 index 中其他已暂存文件意外带入 commit。
                     */
                    paths: z.array(z.string().min(1)).min(1).max(100).optional(),
                }),
        },
        async ({ project, message, paths }) =>
            safeResult(
                async () => runOperation(
                    runtime,
                    { tool: 'git_commit', project },
                    async (operation) => {
                        const resolved = await operation.step(
                            'resolve_project',
                            () => resolveProject(project),
                            '解析并加载已注册项目',
                        );
                        const result = await gitCommit(resolved, message, paths, operation);
                        return { result, summary: { pathCount: paths?.length, scoped: Boolean(paths) } };
                    },
                ),
                {
                    toolName: 'git_commit',
                    // commit message 和路径都可能携带业务上下文；审计日志只保留安全摘要。
                    params: { project, pathCount: paths?.length, scoped: Boolean(paths) },
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
                async () => runOperation(
                    runtime,
                    { tool: 'git_push', project },
                    async (operation) => {
                        const resolved = await operation.step(
                            'resolve_project',
                            () => resolveProject(project),
                            '解析并加载已注册项目',
                        );
                        const result = await gitPush(resolved, remote, branch, operation);
                        return { result, summary: { remote, branchSpecified: Boolean(branch) } };
                    },
                ),
                {
                    toolName: 'git_push',
                    params: { project, remote, branchSpecified: Boolean(branch) },
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
