import type {
    McpServer,
} from '@modelcontextprotocol/server';

import * as z from 'zod/v4';

import {
    resolveProject,
    runTask,
} from '@shworks/local-core';

import {
    safeResult,
} from '../result.js';

/**
 * 注册 Shell 任务执行相关 MCP 工具。
 *
 * 目的在于允许模型以受控方式执行项目中预先配置的合法构建与维护脚本。
 */
export function registerShellTools(
    server: McpServer,
): void {
    server.registerTool(
        'run_task',
        {
            description:
                '执行 .devmcp.yaml 中预定义的安全项目任务',

            inputSchema:
                z.object({
                    project:
                        z.string(),

                    task:
                        z.string(),
                }),
        },
        async ({
                   project,
                   task,
               }) =>
            safeResult(
                async () => {
                    const resolved =
                        await resolveProject(
                            project,
                        );

                    return runTask(
                        resolved,
                        task,
                    );
                },
                {
                    toolName: 'run_task',
                    params: { project, task },
                },
            ),
    );
}
