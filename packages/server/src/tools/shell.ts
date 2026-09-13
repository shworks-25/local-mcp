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
            ),
    );
}
