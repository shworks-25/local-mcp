import pino from 'pino';

/**
 * MCP stdio 模式下 stdout 属于 JSON-RPC 通道。
 *
 * 所以日志必须输出到 stderr。
 */
export const logger = pino(
    {
        level: process.env.SHDEV_LOG_LEVEL ?? 'info',
    },
    pino.destination(2),
);
