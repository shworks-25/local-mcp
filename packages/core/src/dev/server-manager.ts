import {
    spawn,
    type ChildProcess,
} from 'node:child_process';
import {
    randomUUID,
} from 'node:crypto';

import type {
    ResolvedProject,
} from '../project/resolver.js';
import type {
    DeveloperRuntime,
} from '../runtime/developer-runtime.js';
import {
    assertPermission,
} from '../security/permissions.js';
import {
    buildSafeProcessEnv,
    killProcessTree,
} from '../shell/process.js';
import {
    prepareTaskExecution,
} from '../shell/runner.js';

const MAX_LOG_BYTES = 500_000;
const MAX_ACTIVE_PROCESSES = 4;
const MAX_ACTIVE_PROCESSES_PER_PROJECT = 2;
const MAX_PROCESS_RECORDS = 100;

interface LogBuffer {
    chunks: Buffer[];
    bytes: number;
}

interface DevProcessRecord {
    id: string;
    project: string;
    task: string;
    child: ChildProcess;
    startedAt: string;
    stdout: LogBuffer;
    stderr: LogBuffer;
    exitCode?: number;
}

export interface DevProcessInfo {
    id: string;
    project: string;
    task: string;
    startedAt: string;
    running: boolean;
    pid?: number;
    exitCode?: number;
}

function getProcesses(
    runtime: DeveloperRuntime,
): Map<string, DevProcessRecord> {
    return runtime.getStore(
        'dev:processes',
        () => new Map<string, DevProcessRecord>(),
    );
}

function ensureRuntimeCleanup(
    runtime: DeveloperRuntime,
): void {
    const state = runtime.getStore(
        'dev:cleanup-state',
        () => ({ installed: false }),
    );

    if (state.installed) {
        return;
    }

    state.installed = true;
    runtime.registerCleanup(
        () => devShutdownRuntime(runtime),
    );
}

function createLogBuffer(): LogBuffer {
    return {
        chunks: [],
        bytes: 0,
    };
}

function appendLog(
    log: LogBuffer,
    chunk: Buffer,
): void {
    if (chunk.length === 0) {
        return;
    }

    log.chunks.push(Buffer.from(chunk));
    log.bytes += chunk.length;

    while (
        log.bytes > MAX_LOG_BYTES &&
        log.chunks.length > 0
    ) {
        const overflow =
            log.bytes - MAX_LOG_BYTES;
        const first = log.chunks[0]!;

        if (first.length <= overflow) {
            log.chunks.shift();
            log.bytes -= first.length;
            continue;
        }

        log.chunks[0] = Buffer.from(
            first.subarray(overflow),
        );
        log.bytes -= overflow;
    }
}

function logBufferToString(
    log: LogBuffer,
): string {
    return Buffer.concat(
        log.chunks,
        log.bytes,
    ).toString('utf8');
}

function pruneProcessRecords(
    processes: Map<string, DevProcessRecord>,
): void {
    if (processes.size <= MAX_PROCESS_RECORDS) {
        return;
    }

    for (const [id, record] of processes) {
        if (record.exitCode !== undefined) {
            processes.delete(id);
        }

        if (processes.size <= MAX_PROCESS_RECORDS) {
            break;
        }
    }
}

function getProjectRecord(
    runtime: DeveloperRuntime,
    project: ResolvedProject,
    id: string,
): DevProcessRecord {
    const record = getProcesses(runtime).get(id);

    if (!record) {
        throw new Error(`未知 dev process：${id}`);
    }

    if (record.project !== project.record.name) {
        throw new Error('dev process 不属于当前项目');
    }

    return record;
}

export async function devStart(
    runtime: DeveloperRuntime,
    project: ResolvedProject,
    task: string,
): Promise<{
    id: string;
    pid: number | undefined;
    project: string;
    task: string;
    startedAt: string;
}> {
    ensureRuntimeCleanup(runtime);

    const processes = getProcesses(runtime);
    pruneProcessRecords(processes);

    const active = [...processes.values()].filter(
        (record) => record.exitCode === undefined,
    );
    const activeForProject = active.filter(
        (record) => record.project === project.record.name,
    );

    if (active.length >= MAX_ACTIVE_PROCESSES) {
        throw new Error(
            `同时运行的 dev process 已达到上限：${MAX_ACTIVE_PROCESSES}`,
        );
    }

    if (
        activeForProject.length >=
        MAX_ACTIVE_PROCESSES_PER_PROJECT
    ) {
        throw new Error(
            `项目 ${project.record.name} 的 dev process 已达到上限：${MAX_ACTIVE_PROCESSES_PER_PROJECT}`,
        );
    }

    const plan = await prepareTaskExecution(project, task);
    const id = randomUUID();
    const startedAt = new Date().toISOString();

    const child = spawn(
        plan.program,
        plan.args,
        {
            cwd: plan.cwd,
            shell: false,
            env: buildSafeProcessEnv(
                process.env,
                plan.env,
            ),
            detached:
                process.platform !== 'win32',
            stdio: [
                'ignore',
                'pipe',
                'pipe',
            ],
        },
    );

    const record: DevProcessRecord = {
        id,
        project: project.record.name,
        task,
        child,
        startedAt,
        stdout: createLogBuffer(),
        stderr: createLogBuffer(),
    };

    processes.set(id, record);

    child.stdout?.on('data', (chunk: Buffer) => {
        appendLog(record.stdout, chunk);
    });

    child.stderr?.on('data', (chunk: Buffer) => {
        appendLog(record.stderr, chunk);
    });

    child.on('close', (code) => {
        record.exitCode = code ?? -1;
    });

    child.on('error', (error) => {
        appendLog(
            record.stderr,
            Buffer.from(`\n${error.message}\n`),
        );
        record.exitCode = -1;
    });

    return {
        id,
        pid: child.pid,
        project: record.project,
        task,
        startedAt,
    };
}

export function devList(
    runtime: DeveloperRuntime,
    project: ResolvedProject,
): DevProcessInfo[] {
    assertPermission(project.permissions, 'read');

    return [...getProcesses(runtime).values()]
        .filter(
            (record) =>
                record.project === project.record.name,
        )
        .map((record) => ({
            id: record.id,
            project: record.project,
            task: record.task,
            startedAt: record.startedAt,
            running: record.exitCode === undefined,
            pid: record.child.pid,
            exitCode: record.exitCode,
        }));
}

export function devLogs(
    runtime: DeveloperRuntime,
    project: ResolvedProject,
    id: string,
    maxChars = 20_000,
): {
    id: string;
    running: boolean;
    stdout: string;
    stderr: string;
    exitCode?: number;
} {
    assertPermission(project.permissions, 'read');

    const record = getProjectRecord(
        runtime,
        project,
        id,
    );

    return {
        id,
        running: record.exitCode === undefined,
        stdout:
            logBufferToString(record.stdout)
                .slice(-maxChars),
        stderr:
            logBufferToString(record.stderr)
                .slice(-maxChars),
        exitCode: record.exitCode,
    };
}

export async function devStop(
    runtime: DeveloperRuntime,
    project: ResolvedProject,
    id: string,
): Promise<{
    id: string;
    stopped: boolean;
}> {
    const record = getProjectRecord(
        runtime,
        project,
        id,
    );

    if (record.exitCode !== undefined) {
        return {
            id,
            stopped: true,
        };
    }

    killProcessTree(
        record.child,
        'SIGTERM',
    );

    await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
            if (record.exitCode === undefined) {
                killProcessTree(
                    record.child,
                    'SIGKILL',
                );
            }
            resolve();
        }, 3_000);

        record.child.once('close', () => {
            clearTimeout(timer);
            resolve();
        });
    });

    return {
        id,
        stopped: true,
    };
}

export async function devShutdownRuntime(
    runtime: DeveloperRuntime,
): Promise<void> {
    const processes = getProcesses(runtime);
    const active = [...processes.values()].filter(
        (record) => record.exitCode === undefined,
    );

    for (const record of active) {
        killProcessTree(
            record.child,
            'SIGTERM',
        );
    }

    if (active.length === 0) {
        return;
    }

    await new Promise<void>((resolve) => {
        setTimeout(resolve, 1_500).unref();
    });

    for (const record of active) {
        if (record.exitCode === undefined) {
            killProcessTree(
                record.child,
                'SIGKILL',
            );
        }
    }
}

/**
 * 检查指定 DeveloperRuntime 是否存在正在运行中的活动后台进程。
 *
 * 核心目的：
 * 供宿主 HTTP 服务在执行 LRU 资源回收或空闲淘汰时进行活跃状态检测，
 * 避免淘汰时误杀正在执行关键编译或测试的开发进程。
 */
export function devHasActiveProcesses(
    runtime: DeveloperRuntime,
): boolean {
    const processes = getProcesses(runtime);
    for (const record of processes.values()) {
        if (record.exitCode === undefined) {
            return true;
        }
    }
    return false;
}
