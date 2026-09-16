import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Client, type ConnectConfig } from 'ssh2';

import type { SshConnectionConfig } from '../config/schema.js';
import { expandHomePath } from '../config/loader.js';
import { SshConnectionError } from './errors.js';

/**
 * 统一读取 SSH profile 显式声明的 secret。
 *
 * 这里只允许按配置中的环境变量名称读取单个值，不提供任意 env 枚举能力；错误信息也只包含
 * “变量未设置”，不会把 secret 内容写入 MCP 返回值或日志。未来接入 macOS Keychain 时，
 * 可以把本函数替换成独立 SecretResolver，而 SSH 上层调用无需变化。
 */
function readSecret(name: string | undefined, label: string): string | undefined {
    if (!name) return undefined;
    const value = process.env[name];
    if (!value) {
        // 不把环境变量名称返回给 MCP 客户端。变量名虽然通常不是 secret，
        // 但它属于用户配置细节，也可能暴露内部部署命名约定。
        throw new SshConnectionError(
            'SSH_SECRET_MISSING',
            `${label}所引用的安全凭据未配置，请检查本地运行环境。`,
        );
    }
    return value;
}

function resolveUsername(connection: SshConnectionConfig): string {
    if (connection.username) return connection.username;
    return readSecret(connection.usernameEnv, 'SSH 用户名')!;
}

/**
 * ssh2 的 hostVerifier 收到服务端原始 Host Key。这里使用与 OpenSSH
 * `ssh-keygen -E sha256` 相同的 SHA-256 + Base64 方式计算 fingerprint。
 * OpenSSH 会省略 Base64 尾部的 `=` padding，因此比较前统一去除 padding。
 *
 * 未配置或不匹配时直接拒绝连接，避免自动化 MCP 场景出现“首次连接自动信任”
 * 导致的中间人攻击风险。这里刻意不输出 expected/received fingerprint，
 * 保持生产环境错误信息简洁，避免遗留临时诊断信息。
 */
function buildHostVerifier(expectedFingerprint: string): (key: Buffer) => boolean {
    const normalized = expectedFingerprint.startsWith('SHA256:')
        ? expectedFingerprint.slice('SHA256:'.length)
        : expectedFingerprint;

    return (key: Buffer) =>
        createHash('sha256')
            .update(key)
            .digest('base64')
            .replace(/=+$/, '') === normalized.replace(/=+$/, '');
}

export async function buildSshConnectConfig(
    connection: SshConnectionConfig,
): Promise<ConnectConfig> {
    if (!connection.hostKeyFingerprint) {
        throw new SshConnectionError(
            'SSH_CONFIG_INVALID',
            'SSH 连接缺少服务器身份校验配置，已拒绝自动信任未知主机。',
        );
    }

    const config: ConnectConfig = {
        host: connection.host,
        port: connection.port,
        username: resolveUsername(connection),
        readyTimeout: connection.connectTimeoutMs,
        keepaliveInterval: connection.keepAliveIntervalMs,
        keepaliveCountMax: 3,
        hostVerifier: buildHostVerifier(connection.hostKeyFingerprint),
    };

    if (connection.auth.type === 'password') {
        config.password = readSecret(connection.auth.passwordEnv, 'SSH 密码');
    } else {
        try {
            config.privateKey = await readFile(expandHomePath(connection.auth.privateKeyPath));
        } catch (error) {
            // 不返回展开后的绝对路径。路径可能包含本机用户名、目录结构等隐私信息。
            throw new SshConnectionError(
                'SSH_PRIVATE_KEY_UNAVAILABLE',
                'SSH 私钥文件无法读取，请检查私钥文件是否存在以及当前进程权限。',
                { cause: error },
            );
        }
        config.passphrase = readSecret(connection.auth.passphraseEnv, 'SSH 私钥口令');
    }

    return config;
}

/**
 * 建立一个已经完成认证和 host-key 验证的 ssh2 Client。
 * Client 生命周期由调用者/Connection Manager 管理，避免每个数据库请求重新握手。
 */
/**
 * 将 ssh2 / Node.js 的底层连接错误转换成稳定、安全的 SSH 错误码。
 *
 * 注意：这里只依据错误类型/错误码/固定错误特征分类，不把底层 message 原样返回客户端。
 * 原始 error 仍通过 cause 保留在服务内部，既方便开发者日志诊断，也避免用户填写的
 * host、username、privateKeyPath、fingerprint 或认证信息意外进入 MCP 响应。
 */
function normalizeConnectionError(error: unknown): SshConnectionError {
    if (error instanceof SshConnectionError) return error;

    const nodeError = error as NodeJS.ErrnoException;
    const message = error instanceof Error ? error.message : String(error);
    const level = (error as { level?: unknown })?.level;

    if (message.includes('Host denied') || message.includes('verification failed')) {
        return new SshConnectionError(
            'SSH_HOST_KEY_MISMATCH',
            'SSH 服务器身份校验失败，请通过可信渠道核对服务器 Host Key 后再连接。',
            { cause: error },
        );
    }

    if (level === 'client-authentication' || message.includes('All configured authentication methods failed')) {
        return new SshConnectionError(
            'SSH_AUTH_FAILED',
            'SSH 用户认证失败，请检查用户名、认证方式以及服务器端授权配置。',
            { cause: error },
        );
    }

    if (message.includes('Cannot parse privateKey') || message.includes('bad passphrase')) {
        return new SshConnectionError(
            'SSH_PRIVATE_KEY_INVALID',
            'SSH 私钥解析失败，请检查私钥格式以及私钥口令是否正确。',
            { cause: error },
        );
    }

    if (nodeError.code === 'ETIMEDOUT' || message.toLowerCase().includes('timed out')) {
        return new SshConnectionError(
            'SSH_CONNECTION_TIMEOUT',
            'SSH 连接超时，请检查网络连通性、防火墙和 SSH 服务状态。',
            { cause: error },
        );
    }

    if (nodeError.code === 'ECONNREFUSED') {
        return new SshConnectionError(
            'SSH_CONNECTION_REFUSED',
            'SSH 连接被目标端拒绝，请检查 SSH 服务是否启动以及端口是否开放。',
            { cause: error },
        );
    }

    if (nodeError.code === 'ENOTFOUND' || nodeError.code === 'EAI_AGAIN') {
        return new SshConnectionError(
            'SSH_DNS_FAILED',
            'SSH 目标地址解析失败，请检查网络或主机地址配置。',
            { cause: error },
        );
    }

    return new SshConnectionError(
        'SSH_CONNECTION_FAILED',
        'SSH 连接失败，请检查连接配置、网络状态和服务器日志。',
        { cause: error },
    );
}

export async function connectSsh(connection: SshConnectionConfig): Promise<Client> {
    let config: ConnectConfig;
    try {
        config = await buildSshConnectConfig(connection);
    } catch (error) {
        throw normalizeConnectionError(error);
    }

    const client = new Client();

    return await new Promise<Client>((resolve, reject) => {
        const onError = (error: Error) => reject(normalizeConnectionError(error));
        client.once('error', onError);
        client.once('ready', () => {
            client.off('error', onError);
            resolve(client);
        });

        // ssh2 也可能在 connect() 同步解析私钥时抛错（例如错误 passphrase）。
        // 同步异常同样必须进入安全错误归一化流程，不能绕过 MCP 的脱敏边界。
        try {
            client.connect(config);
        } catch (error) {
            client.off('error', onError);
            reject(normalizeConnectionError(error));
        }
    });
}
