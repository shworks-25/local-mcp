import pino from 'pino';

/**
 * 敏感字段名匹配模式。
 * 用于在日志序列化前自动识别并遮蔽可能泄露的凭证与敏感数据。
 */
const SENSITIVE_KEY_PATTERN = /token|secret|password|authorization|auth_token|api_?key/i;

/**
 * 日志清洗与截断配置选项。
 */
export interface SanitizeOptions {
    /** 字符串允许保留的最大字符数，超出部分将被安全截断 */
    maxStringLength?: number;
    /** 允许遍历的最大嵌套对象深度，防止循环引用或超深层结构消耗过多性能 */
    maxDepth?: number;
}

/**
 * 清洗和截断待记录的日志数据。
 *
 * 核心目的在于防止大文件读写操作产生的超大字符串打爆日志存储与终端缓冲区，
 * 同时对高危鉴权字段进行脱敏遮盖，确保审计安全。
 *
 * @param data 待清洗的原始数据
 * @param options 清洗参数控制
 * @returns 经过脱敏与截断处理的安全数据副本
 */
export function sanitizeLogData(
    data: unknown,
    options: SanitizeOptions = {},
): unknown {
    const {
        maxStringLength = 300,
        maxDepth = 4,
    } = options;

    const seen = new WeakSet<object>();

    function walk(val: unknown, depth: number): unknown {
        if (val === null || val === undefined) {
            return val;
        }

        if (typeof val === 'string') {
            if (val.length <= maxStringLength) {
                return val;
            }
            return `${val.slice(0, maxStringLength)}... [truncated, total: ${val.length} chars]`;
        }

        if (typeof val !== 'object') {
            return val;
        }

        if (Buffer.isBuffer(val)) {
            return `[Buffer: ${val.length} bytes]`;
        }

        if (val instanceof Error) {
            return {
                name: val.name,
                message: val.message,
                stack: val.stack,
            };
        }

        if (depth > maxDepth) {
            return '[MaxDepth]';
        }

        if (seen.has(val)) {
            return '[Circular]';
        }
        seen.add(val);

        if (Array.isArray(val)) {
            return val.map((item) => walk(item, depth + 1));
        }

        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(val)) {
            if (SENSITIVE_KEY_PATTERN.test(key)) {
                result[key] = '[REDACTED]';
            } else {
                result[key] = walk(value, depth + 1);
            }
        }
        return result;
    }

    return walk(data, 1);
}

/**
 * 基础 Pino 日志实例。
 *
 * 在 MCP stdio 通信模式下，stdout 严格属于 JSON-RPC 消息通道，
 * 因此日志必须无条件输出到 stderr (文件描述符 2)。
 */
export const logger = pino(
    {
        level: process.env.SHDEV_LOG_LEVEL ?? 'info',
        serializers: {
            err: pino.stdSerializers.err,
            error: pino.stdSerializers.err,
        },
    },
    pino.destination(2),
);

/**
 * 获取带有指定业务模块名称的子日志器。
 *
 * 方便在微内核及各个插件模块中保留清晰的模块上下文命名空间，
 * 简化日志检索与问题定位。
 *
 * @param module 业务模块标识，例如 'mcp:tool', 'core:fs', 'security'
 * @returns 绑定了模块上下文属性的子 Pino Logger 实例
 */
export function getLogger(module: string): pino.Logger {
    return logger.child({ module });
}
