import type {
    McpServer,
} from '@modelcontextprotocol/server';

import * as z from 'zod/v4';

import type {
    DeveloperRuntime,
} from '@shworks/local-core';

import {
    devList,
    devLogs,
    devStart,
    devStop,
    lint,
    packageRunScript,
    packageScripts,
    resolveProject,
    securityScan,
    symbolDefinition,
    symbolReferences,
    testFailures,
    testRun,
    typecheck,
    workspaceRestore,
    workspaceRestorePreview,
    workspaceSnapshot,
    workspaceSnapshotList,
} from '@shworks/local-core';

import {
    safeResult,
} from '../result.js';

export function registerDeveloperTools(
    server: McpServer,
    runtime: DeveloperRuntime,
): void {
    server.registerTool(
        'test_run',
        {
            description: '运行项目测试并返回结构化诊断结果',
            inputSchema: z.object({
                project: z.string().min(1),
            }),
        },
        async ({ project }) =>
            safeResult(
                async () =>
                    testRun(
                        runtime,
                        await resolveProject(project),
                    ),
                {
                    toolName: 'test_run',
                    params: { project },
                },
            ),
    );

    server.registerTool(
        'test_failures',
        {
            description: '查看当前 Developer Runtime 中最近一次 test_run 的失败诊断',
            inputSchema: z.object({
                project: z.string().min(1),
            }),
        },
        async ({ project }) =>
            safeResult(
                async () =>
                    testFailures(
                        runtime,
                        await resolveProject(project),
                    ),
                {
                    toolName: 'test_failures',
                    params: { project },
                },
            ),
    );

    server.registerTool(
        'typecheck',
        {
            description: '运行项目类型检查任务或 package.json 的 typecheck script',
            inputSchema: z.object({
                project: z.string().min(1),
            }),
        },
        async ({ project }) =>
            safeResult(
                async () =>
                    typecheck(
                        await resolveProject(project),
                    ),
                {
                    toolName: 'typecheck',
                    params: { project },
                },
            ),
    );

    server.registerTool(
        'lint',
        {
            description: '运行项目 lint 任务或 package.json 的 lint script',
            inputSchema: z.object({
                project: z.string().min(1),
            }),
        },
        async ({ project }) =>
            safeResult(
                async () =>
                    lint(
                        await resolveProject(project),
                    ),
                {
                    toolName: 'lint',
                    params: { project },
                },
            ),
    );

    server.registerTool(
        'symbol_definition',
        {
            description: '跨语言启发式查找代码符号定义位置',
            inputSchema: z.object({
                project: z.string().min(1),
                symbol: z.string().min(1),
                maxResults: z.number().int().min(1).max(200).default(50),
            }),
        },
        async ({ project, symbol, maxResults }) =>
            safeResult(
                async () =>
                    symbolDefinition(
                        await resolveProject(project),
                        symbol,
                        maxResults,
                    ),
                {
                    toolName: 'symbol_definition',
                    params: { project, symbol, maxResults },
                },
            ),
    );

    server.registerTool(
        'symbol_references',
        {
            description: '跨语言文本/启发式查找代码符号引用位置',
            inputSchema: z.object({
                project: z.string().min(1),
                symbol: z.string().min(1),
                maxResults: z.number().int().min(1).max(500).default(200),
            }),
        },
        async ({ project, symbol, maxResults }) =>
            safeResult(
                async () =>
                    symbolReferences(
                        await resolveProject(project),
                        symbol,
                        maxResults,
                    ),
                {
                    toolName: 'symbol_references',
                    params: { project, symbol, maxResults },
                },
            ),
    );

    server.registerTool(
        'dev_start',
        {
            description: '启动 .devmcp.yaml 中预定义的长生命周期开发任务',
            inputSchema: z.object({
                project: z.string().min(1),
                task: z.string().min(1),
            }),
        },
        async ({ project, task }) =>
            safeResult(
                async () =>
                    devStart(
                        runtime,
                        await resolveProject(project),
                        task,
                    ),
                {
                    toolName: 'dev_start',
                    params: { project, task },
                },
            ),
    );

    server.registerTool(
        'dev_logs',
        {
            description: '读取 dev_start 启动进程的最近日志',
            inputSchema: z.object({
                project: z.string().min(1),
                id: z.string().min(1),
                maxChars: z.number().int().min(100).max(100_000).default(20_000),
            }),
        },
        async ({ project, id, maxChars }) =>
            safeResult(
                async () =>
                    devLogs(
                        runtime,
                        await resolveProject(project),
                        id,
                        maxChars,
                    ),
                {
                    toolName: 'dev_logs',
                    params: { project, id, maxChars },
                },
            ),
    );

    server.registerTool(
        'dev_stop',
        {
            description: '停止 dev_start 启动的开发进程',
            inputSchema: z.object({
                project: z.string().min(1),
                id: z.string().min(1),
            }),
        },
        async ({ project, id }) =>
            safeResult(
                async () =>
                    devStop(
                        runtime,
                        await resolveProject(project),
                        id,
                    ),
                {
                    toolName: 'dev_stop',
                    params: { project, id },
                },
            ),
    );

    server.registerTool(
        'dev_list',
        {
            description: '查询当前 Developer Runtime 中登记管理的后台长驻开发进程列表',
            inputSchema: z.object({
                project: z.string().min(1),
            }),
        },
        async ({ project }) =>
            safeResult(
                async () =>
                    devList(
                        runtime,
                        await resolveProject(project),
                    ),
                {
                    toolName: 'dev_list',
                    params: { project },
                },
            ),
    );

    server.registerTool(
        'package_scripts',
        {
            description: '列出 package.json 中可用 scripts 与检测到的包管理器',
            inputSchema: z.object({
                project: z.string().min(1),
            }),
        },
        async ({ project }) =>
            safeResult(
                async () =>
                    packageScripts(
                        await resolveProject(project),
                    ),
                {
                    toolName: 'package_scripts',
                    params: { project },
                },
            ),
    );

    server.registerTool(
        'package_run_script',
        {
            description: '运行 package.json 中已经存在的 script，不接受任意 shell 字符串',
            inputSchema: z.object({
                project: z.string().min(1),
                script: z.string().min(1),
                args: z.array(z.string()).max(50).default([]),
                timeoutMs: z.number().int().positive().max(600_000).default(120_000),
            }),
        },
        async ({ project, script, args, timeoutMs }) =>
            safeResult(
                async () =>
                    packageRunScript(
                        await resolveProject(project),
                        script,
                        args,
                        timeoutMs,
                    ),
                {
                    toolName: 'package_run_script',
                    params: { project, script, args, timeoutMs },
                },
            ),
    );

    server.registerTool(
        'workspace_snapshot',
        {
            description: '创建当前 Git 工作区的 Developer Runtime 快照，最大 2000 文件 / 10MB',
            inputSchema: z.object({
                project: z.string().min(1),
            }),
        },
        async ({ project }) =>
            safeResult(
                async () =>
                    workspaceSnapshot(
                        runtime,
                        await resolveProject(project),
                    ),
                {
                    toolName: 'workspace_snapshot',
                    params: { project },
                },
            ),
    );

    server.registerTool(
        'workspace_restore',
        {
            description: '恢复 workspace_snapshot 创建的会话内快照',
            inputSchema: z.object({
                project: z.string().min(1),
                snapshotId: z.string().min(1),
            }),
        },
        async ({ project, snapshotId }) =>
            safeResult(
                async () =>
                    workspaceRestore(
                        runtime,
                        await resolveProject(project),
                        snapshotId,
                    ),
                {
                    toolName: 'workspace_restore',
                    params: { project, snapshotId },
                },
            ),
    );

    server.registerTool(
        'workspace_snapshot_list',
        {
            description: '查询当前 Developer Runtime 中项目已创建的工作区快照列表',
            inputSchema: z.object({
                project: z.string().min(1),
            }),
        },
        async ({ project }) =>
            safeResult(
                async () =>
                    workspaceSnapshotList(
                        runtime,
                        await resolveProject(project),
                    ),
                {
                    toolName: 'workspace_snapshot_list',
                    params: { project },
                },
            ),
    );

    server.registerTool(
        'workspace_restore_preview',
        {
            description: '预览 workspace_restore 将覆盖、删除或保留哪些文件，不执行修改',
            inputSchema: z.object({
                project: z.string().min(1),
                snapshotId: z.string().min(1),
            }),
        },
        async ({ project, snapshotId }) =>
            safeResult(
                async () =>
                    workspaceRestorePreview(
                        runtime,
                        await resolveProject(project),
                        snapshotId,
                    ),
                {
                    toolName: 'workspace_restore_preview',
                    params: { project, snapshotId },
                },
            ),
    );

    server.registerTool(
        'runtime_status',
        {
            description: '查看当前 MCP Developer Runtime 会话标识及已初始化的运行时状态存储',
            inputSchema: z.object({}),
        },
        async () =>
            safeResult(
                async () => runtime.status(),
                {
                    toolName: 'runtime_status',
                    params: {},
                },
            ),
    );

    server.registerTool(
        'runtime_capabilities',
        {
            description: '查看当前 Developer Runtime 的能力范围与状态隔离模型',
            inputSchema: z.object({}),
        },
        async () =>
            safeResult(
                async () => runtime.capabilities(),
                {
                    toolName: 'runtime_capabilities',
                    params: {},
                },
            ),
    );

    server.registerTool(
        'runtime_reset',
        {
            description: '清理当前 Developer Runtime 的测试缓存、快照和后台开发进程，不影响其他 runtime',
            inputSchema: z.object({}),
        },
        async () =>
            safeResult(
                async () => {
                    await runtime.reset();
                    return {
                        reset: true,
                        runtimeId: runtime.id,
                    };
                },
                {
                    toolName: 'runtime_reset',
                    params: {},
                },
            ),
    );

    server.registerTool(
        'security_scan',
        {
            description: '扫描项目任务、package scripts 与源码中的常见高风险模式',
            inputSchema: z.object({
                project: z.string().min(1),
            }),
        },
        async ({ project }) =>
            safeResult(
                async () =>
                    securityScan(
                        await resolveProject(project),
                    ),
                {
                    toolName: 'security_scan',
                    params: { project },
                },
            ),
    );
}
