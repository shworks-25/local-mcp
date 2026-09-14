import type {
    Command,
} from 'commander';

import {
    startStdioServer,
} from '@shworks/local-mcp';

/**
 * 注册 MCP stdio 服务启动子命令。
 *
 * 规范与防御要求：
 * - 启动失败时严禁向 stdout 输出任何非 JSON-RPC 文本，必须通过 stderr 输出原因，供宿主捕获。
 * - 保持 start 作为向后兼容别名。
 */
export function registerMcpCommand(
    program: Command,
): void {
    program
        .command('mcp')
        .alias('start')
        .description(
            '启动本地 MCP stdio 服务',
        )
        .action(
            async () => {
                try {
                    await startStdioServer();
                } catch (error) {
                    const message =
                        error instanceof Error
                            ? error.message
                            : String(error);

                    process.stderr.write(
                        `[shcli] 启动 MCP stdio 服务失败: ${message}\n`,
                    );
                    process.exit(1);
                }
            },
        );
}
