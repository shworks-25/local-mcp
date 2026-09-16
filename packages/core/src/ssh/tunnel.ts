import { createServer, type Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import type { Client } from 'ssh2';

import type { DeveloperRuntime } from '../runtime/developer-runtime.js';
import type { ResolvedProject } from '../project/resolver.js';
import { connectSsh } from './connection.js';
import { getSshConnection } from './client.js';

export interface SshTunnelInfo {
    id: string;
    project: string;
    connection: string;
    localHost: '127.0.0.1';
    localPort: number;
    remoteHost: string;
    remotePort: number;
    createdAt: string;
}

interface ManagedTunnel extends SshTunnelInfo {
    client: Client;
    server: Server;
}

const STORE_KEY = 'ssh:tunnels';
function getStore(runtime: DeveloperRuntime): Map<string, ManagedTunnel> {
    return runtime.getStore(STORE_KEY, () => new Map<string, ManagedTunnel>());
}

function stripRuntime(tunnel: ManagedTunnel): SshTunnelInfo {
    const { client: _client, server: _server, ...info } = tunnel;
    return info;
}

/**
 * 使用 ssh2 forwardOut 实现本地 TCP forwarding。
 *
 * 本地监听地址被硬编码为 127.0.0.1，避免数据库等内部服务被暴露到局域网；每一个进入
 * 本地 listener 的 TCP socket 都映射为一条 SSH direct-tcpip channel。SSH Client 与
 * listener 一起由 DeveloperRuntime 托管，因此 runtime.reset() 会同时释放网络资源。
 */
export async function sshTunnelOpen(
    runtime: DeveloperRuntime,
    project: ResolvedProject,
    connectionName: string,
    localPort: number,
    remoteHost: string,
    remotePort: number,
): Promise<SshTunnelInfo> {
    if (!project.record.trusted) throw new Error('未受信任项目禁止建立 SSH 隧道');
    // localPort=0 交给操作系统分配临时端口，特别适合数据库工具并发建立短生命周期隧道；
    // remotePort 仍必须是明确的远端服务端口。
    if (localPort < 0 || localPort > 65535 || remotePort < 1 || remotePort > 65535) {
        throw new Error('SSH 隧道 localPort 必须位于 0-65535，remotePort 必须位于 1-65535');
    }
    if (!remoteHost || remoteHost.startsWith('-') || /[\s\0]/.test(remoteHost)) {
        throw new Error('SSH 隧道 remoteHost 不合法');
    }

    const connection = getSshConnection(project, connectionName);
    const client = await connectSsh(connection);
    const server = createServer((socket) => {
        client.forwardOut(
            socket.remoteAddress ?? '127.0.0.1',
            socket.remotePort ?? 0,
            remoteHost,
            remotePort,
            (error, stream) => {
                if (error) {
                    socket.destroy(error);
                    return;
                }
                socket.pipe(stream).pipe(socket);
                stream.once('error', (streamError: Error) => socket.destroy(streamError));
                socket.once('error', () => stream.destroy());
            },
        );
    });

    try {
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(localPort, '127.0.0.1', () => {
                server.off('error', reject);
                resolve();
            });
        });
    } catch (error) {
        client.end();
        throw error;
    }

    const address = server.address();
    if (!address || typeof address === 'string') {
        server.close();
        client.end();
        throw new Error('无法确定 SSH 隧道实际本地端口');
    }

    const info: ManagedTunnel = {
        id: randomUUID(),
        project: project.record.name,
        connection: connectionName,
        localHost: '127.0.0.1',
        // 当请求 localPort=0 时必须返回 OS 实际分配的端口，否则数据库上层无法连接。
        localPort: address.port,
        remoteHost,
        remotePort,
        createdAt: new Date().toISOString(),
        client,
        server,
    };

    const store = getStore(runtime);
    store.set(info.id, info);
    const cleanup = () => {
        server.close();
        client.end();
        store.delete(info.id);
    };
    runtime.registerCleanup(cleanup);
    client.once('close', () => {
        server.close();
        store.delete(info.id);
    });

    return stripRuntime(info);
}

export function sshTunnelList(runtime: DeveloperRuntime, project: ResolvedProject): SshTunnelInfo[] {
    return [...getStore(runtime).values()]
        .filter((item) => item.project === project.record.name)
        .map(stripRuntime);
}

export function sshTunnelClose(
    runtime: DeveloperRuntime,
    project: ResolvedProject,
    id: string,
): { closed: true; id: string } {
    const store = getStore(runtime);
    const tunnel = store.get(id);
    if (!tunnel || tunnel.project !== project.record.name) throw new Error(`SSH 隧道不存在：${id}`);
    tunnel.server.close();
    tunnel.client.end();
    store.delete(id);
    return { closed: true, id };
}
