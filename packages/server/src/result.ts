import {
    getLogger,
    sanitizeLogData,
} from '@shworks/local-core';

const defaultToolLogger = getLogger('mcp:tool');

/**
 * 工具调用执行选项，用于提供可观测性审计所需的上下文。
 */
export interface SafeResultOptions {
    /** 调用的 MCP 工具名称，用于定位问题源头 */
    toolName?: string;

    /** 传递给工具的原始参数，将在脱敏后作为调用快照记录 */
    params?: unknown;
}

/**
 * 格式化返回值并包装为标准 MCP 文本内容结构。
 *
 * 目的在于统一 MCP 响应协议规范，支持字符串直接传递及复杂对象的格式化序列化。
 *
 * @param value 需要返回给模型的数据
 */
export function textResult(
    value: unknown,
) {
    const text =
        typeof value === 'string'
            ? value
            : JSON.stringify(
                value,
                null,
                2,
            );

    return {
        content: [
            {
                type:
                    'text' as const,
                text,
            },
        ],
    };
}

/**
 * 安全执行工具逻辑并捕获异常的 AOP 包装器。
 *
 * 核心目的：
 * 保证 MCP 工具执行过程中的任何未捕获异常均不会中断服务连接，
 * 自动拦截并记录入参快照、执行耗时与完整堆栈日志，
 * 同时向客户端返回结构规范的友好错误信息。
 *
 * @param callback 异步业务逻辑
 * @param options 工具上下文配置，包含工具名与调用入参
 */
export async function safeResult(
    callback: () => Promise<unknown>,
    options?: SafeResultOptions,
) {
    const toolName = options?.toolName;
    const toolLogger = toolName
        ? getLogger(`mcp:tool:${toolName}`)
        : defaultToolLogger;

    const startTime = performance.now();
    const sanitizedParams = options?.params !== undefined
        ? sanitizeLogData(options.params)
        : undefined;

    toolLogger.debug(
        { params: sanitizedParams },
        'MCP tool invoked',
    );

    try {
        const value = await callback();
        const durationMs = Math.round(performance.now() - startTime);

        toolLogger.info(
            { durationMs },
            'MCP tool completed successfully',
        );

        return textResult(value);
    } catch (error) {
        const durationMs = Math.round(performance.now() - startTime);
        const message =
            error instanceof Error
                ? error.message
                : String(error);

        toolLogger.error(
            {
                err: error,
                durationMs,
                params: sanitizedParams,
            },
            'MCP tool execution failed',
        );

        return {
            content: [
                {
                    type:
                        'text' as const,
                    text: message,
                },
            ],
            isError: true,
        };
    }
}
