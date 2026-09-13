import type {
    Command,
} from 'commander';

import {
    startStdioServer,
} from '@shworks/local-mcp';

export function registerStartCommand(
    program: Command,
): void {
    program
        .command('start')
        .description(
            '启动 MCP stdio Server',
        )
        .action(
            async () => {
                /*
                 * 注意：
                 * MCP 模式启动之后不能 console.log。
                 */
                startStdioServer();
            },
        );
}
