/**
 * SSH 对外安全错误码。
 *
 * 错误码用于让 MCP、未来 Database MCP 和其他上层能力稳定判断失败阶段，
 * 避免依赖 ssh2 / Node.js 随版本变化的英文错误字符串。
 */
export type SshErrorCode =
    | 'SSH_CONFIG_INVALID'
    | 'SSH_SECRET_MISSING'
    | 'SSH_PRIVATE_KEY_UNAVAILABLE'
    | 'SSH_PRIVATE_KEY_INVALID'
    | 'SSH_HOST_KEY_MISMATCH'
    | 'SSH_AUTH_FAILED'
    | 'SSH_CONNECTION_TIMEOUT'
    | 'SSH_CONNECTION_REFUSED'
    | 'SSH_DNS_FAILED'
    | 'SSH_CONNECTION_FAILED';

/**
 * SSH 层统一的结构化错误。
 *
 * publicMessage 是唯一允许直接返回 MCP 客户端的文本，不包含 password、passphrase、
 * 私钥内容、私钥路径、环境变量值、username、host-key fingerprint 等用户配置细节。
 * cause 仅保留在服务内部错误链中，便于本地日志/调试定位底层 ssh2 或 Node.js 错误。
 */
export class SshConnectionError extends Error {
    public readonly name = 'SshConnectionError';

    public constructor(
        public readonly code: SshErrorCode,
        public readonly publicMessage: string,
        options?: { cause?: unknown },
    ) {
        super(`${code}: ${publicMessage}`, options);
    }
}

/**
 * MCP 响应只使用安全的 code + publicMessage。
 * 对非 SSH 结构化错误保持 undefined，让通用 safeResult 继续采用原来的处理方式。
 */
export function getPublicSshError(error: unknown): string | undefined {
    if (!(error instanceof SshConnectionError)) return undefined;
    return `${error.code}: ${error.publicMessage}`;
}
