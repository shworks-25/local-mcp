import { basename } from 'node:path';
import type { ClientChannel } from 'ssh2';

import type { ResolvedProject } from '../project/resolver.js';
import type { SshConnectionConfig } from '../config/schema.js';
import { connectSsh } from './connection.js';

export interface SshConnectionSummary {
    name: string;
    host: string;
    port: number;
    usernameSource: 'literal' | 'env';
    authType: 'password' | 'private-key';
    hostKeyVerification: true;
    allowedPrograms: string[];
}

function resolveConnection(project: ResolvedProject, name: string): SshConnectionConfig {
    const connection = project.config.ssh.connections[name];
    if (!connection) throw new Error(`SSH 连接不存在：${name}`);
    return connection;
}

export function sshConnections(project: ResolvedProject): SshConnectionSummary[] {
    return Object.entries(project.config.ssh.connections)
        .map(([name, connection]) => ({
            name,
            host: connection.host,
            port: connection.port,
            usernameSource: connection.username ? 'literal' as const : 'env' as const,
            authType: connection.auth.type,
            hostKeyVerification: true as const,
            allowedPrograms: [...connection.allowedPrograms],
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
}

export async function sshTestConnection(
    project: ResolvedProject,
    name: string,
): Promise<{ connected: true; host: string; port: number; authType: string }> {
    const connection = resolveConnection(project, name);
    const client = await connectSsh(connection);
    client.end();
    return {
        connected: true,
        host: connection.host,
        port: connection.port,
        authType: connection.auth.type,
    };
}

/**
 * ssh2 exec 接收的是远程命令字符串，因此仍然需要严格编码 argv。
 * 程序名必须来自 profile.allowedPrograms，参数逐个单引号编码，禁止 NUL；调用者无法注入
 * SSH option，也无法通过 /bin/foo 绕过白名单。该边界与密码/私钥认证方式完全解耦。
 */
function quoteRemoteArg(value: string): string {
    if (value.includes('\0')) throw new Error('SSH 参数不能包含 NUL 字符');
    return `'${value.replaceAll("'", "'\\''")}'`;
}

function collectChannel(channel: ClientChannel, timeoutMs: number): Promise<{
    code: number;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}> {
    return new Promise((resolve, reject) => {
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let bytes = 0;
        const maxBytes = 1_000_000;
        let timedOut = false;

        const append = (target: Buffer[], chunk: Buffer) => {
            if (bytes >= maxBytes) return;
            const accepted = chunk.subarray(0, maxBytes - bytes);
            target.push(Buffer.from(accepted));
            bytes += accepted.length;
        };

        channel.on('data', (chunk: Buffer) => append(stdout, chunk));
        channel.stderr.on('data', (chunk: Buffer) => append(stderr, chunk));
        channel.once('error', reject);

        const timer = setTimeout(() => {
            timedOut = true;
            channel.close();
        }, timeoutMs);

        channel.once('close', (code?: number) => {
            clearTimeout(timer);
            resolve({
                code: code ?? (timedOut ? -1 : 0),
                stdout: Buffer.concat(stdout).toString('utf8'),
                stderr: Buffer.concat(stderr).toString('utf8'),
                timedOut,
            });
        });
    });
}

export async function sshExec(
    project: ResolvedProject,
    name: string,
    program: string,
    args: string[],
    timeoutMs = 30_000,
) {
    if (!project.record.trusted) throw new Error('未受信任项目禁止 SSH 远程执行');

    const connection = resolveConnection(project, name);
    const base = basename(program);
    if (program !== base || !connection.allowedPrograms.includes(base)) {
        throw new Error(`SSH profile 未授权远程程序：${program}`);
    }

    const remoteCommand = [base, ...args].map(quoteRemoteArg).join(' ');
    const client = await connectSsh(connection);
    try {
        const channel = await new Promise<ClientChannel>((resolve, reject) => {
            client.exec(remoteCommand, (error, stream) => error ? reject(error) : resolve(stream));
        });
        const result = await collectChannel(channel, timeoutMs);
        if (result.code !== 0) {
            throw new Error(result.stderr.trim() || (result.timedOut ? 'SSH 远程命令执行超时' : 'SSH 远程命令执行失败'));
        }
        return result;
    } finally {
        client.end();
    }
}

export function getSshConnection(project: ResolvedProject, name: string): SshConnectionConfig {
    return resolveConnection(project, name);
}
