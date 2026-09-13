import type {
    McpServer,
} from '@modelcontextprotocol/server';

import * as z from 'zod/v4';

import {
    getProjectContext,
    listProjects,
    syncAutoDiscoveredProjects,
} from '@shworks/local-core';

import {
    safeResult,
} from '../result.js';

export function registerProjectTools(
    server: McpServer,
): void {
    server.registerTool(
        'project_list',
        {
            description:
                '列出当前已注册的所有本地开发项目',

            inputSchema:
                z.object({}),
        },
        async () =>
            safeResult(
                async () => {
                    await syncAutoDiscoveredProjects();

                    return listProjects();
                },
            ),
    );

    server.registerTool(
        'project_context',
        {
            description:
                '获取指定项目的技术栈、Git 状态、权限、任务和 AGENTS.md',

            inputSchema:
                z.object({
                    project:
                        z.string().min(1),
                }),
        },
        async ({
                   project,
               }) =>
            safeResult(
                () =>
                    getProjectContext(
                        project,
                    ),
            ),
    );
}
