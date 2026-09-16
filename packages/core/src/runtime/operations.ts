import { randomUUID } from 'node:crypto';

import type { DeveloperRuntime } from './developer-runtime.js';

export type OperationStatus = 'running' | 'completed' | 'failed';
export type OperationStepStatus = 'running' | 'completed' | 'failed';

export interface OperationStep {
    id: string;
    name: string;
    status: OperationStepStatus;
    message?: string;
    startedAt: string;
    finishedAt?: string;
    durationMs?: number;
}

export interface OperationLog {
    sequence: number;
    timestamp: string;
    level: 'info' | 'warn' | 'error';
    stream?: 'stdout' | 'stderr';
    message: string;
}

export interface OperationRecord {
    id: string;
    tool: string;
    project?: string;
    status: OperationStatus;
    startedAt: string;
    finishedAt?: string;
    durationMs?: number;
    steps: OperationStep[];
    warnings: string[];
    logs: OperationLog[];
    nextLogSequence: number;
    resultSummary?: unknown;
    error?: { message: string };
}

interface OperationStore {
    records: Map<string, OperationRecord>;
}

const STORE_KEY = 'operations';
const MAX_OPERATIONS = 100;
const MAX_WARNINGS = 50;
const MAX_LOGS = 1000;
const MAX_LOG_CHARS = 256_000;

function now(): string {
    return new Date().toISOString();
}

function elapsed(startedAt: string): number {
    return Math.max(0, Date.now() - Date.parse(startedAt));
}

function storeFor(runtime: DeveloperRuntime): OperationStore {
    return runtime.getStore(STORE_KEY, () => ({ records: new Map() }));
}

function prune(store: OperationStore): void {
    while (store.records.size >= MAX_OPERATIONS) {
        const oldest = store.records.keys().next().value as string | undefined;
        if (!oldest) break;
        store.records.delete(oldest);
    }
}

/**
 * OperationContext 只记录“本机工具执行事实”，不记录模型推理过程。
 * 调用方写入 message/resultSummary 时必须使用已经脱敏的摘要；密码、Token、私钥、
 * SQL 参数等业务敏感数据不应进入 Operation Runtime。
 */
export class OperationContext {
    constructor(
        private readonly record: OperationRecord,
    ) {}

    get id(): string {
        return this.record.id;
    }

    async step<T>(
        name: string,
        action: () => Promise<T> | T,
        message?: string,
    ): Promise<T> {
        const step: OperationStep = {
            id: randomUUID(),
            name,
            status: 'running',
            message,
            startedAt: now(),
        };
        this.record.steps.push(step);

        try {
            const result = await action();
            step.status = 'completed';
            step.finishedAt = now();
            step.durationMs = elapsed(step.startedAt);
            return result;
        } catch (error) {
            step.status = 'failed';
            step.finishedAt = now();
            step.durationMs = elapsed(step.startedAt);
            throw error;
        }
    }

    warning(message: string): void {
        if (this.record.warnings.length < MAX_WARNINGS) {
            this.record.warnings.push(message);
        }
        this.log('warn', message);
    }

    /**
     * Operation log 使用有界 ring-buffer 思路：最多 1000 条且总字符数不超过 256KB。
     * 调用方必须传入已脱敏内容；这里适合保存构建 stdout/stderr 等执行事实，不保存 secret。
     */
    log(
        level: OperationLog['level'],
        message: string,
        stream?: OperationLog['stream'],
    ): void {
        if (!message) return;
        const log: OperationLog = {
            sequence: this.record.nextLogSequence++,
            timestamp: now(),
            level,
            stream,
            message,
        };
        this.record.logs.push(log);

        let chars = this.record.logs.reduce((total, item) => total + item.message.length, 0);
        while (this.record.logs.length > MAX_LOGS || chars > MAX_LOG_CHARS) {
            const removed = this.record.logs.shift();
            if (!removed) break;
            chars -= removed.message.length;
        }
    }

    complete(resultSummary?: unknown): void {
        this.record.status = 'completed';
        this.record.finishedAt = now();
        this.record.durationMs = elapsed(this.record.startedAt);
        this.record.resultSummary = resultSummary;
    }

    fail(error: unknown): void {
        this.record.status = 'failed';
        this.record.finishedAt = now();
        this.record.durationMs = elapsed(this.record.startedAt);
        // Operation 对外只保留普通错误消息；结构化 SSH 等能力应在进入这里前完成安全归一化。
        this.record.error = {
            message: error instanceof Error ? error.message : '操作执行失败',
        };
    }
}

export function startOperation(
    runtime: DeveloperRuntime,
    tool: string,
    project?: string,
): OperationContext {
    const store = storeFor(runtime);
    prune(store);

    const record: OperationRecord = {
        id: `op_${randomUUID()}`,
        tool,
        project,
        status: 'running',
        startedAt: now(),
        steps: [],
        warnings: [],
        logs: [],
        nextLogSequence: 1,
    };
    store.records.set(record.id, record);
    return new OperationContext(record);
}

export function operationList(
    runtime: DeveloperRuntime,
    project?: string,
    limit = 20,
): OperationRecord[] {
    return [...storeFor(runtime).records.values()]
        .filter((record) => !project || record.project === project)
        .slice(-Math.max(1, Math.min(limit, 100)))
        .reverse();
}

export function operationGet(
    runtime: DeveloperRuntime,
    id: string,
): OperationRecord {
    const record = storeFor(runtime).records.get(id);
    if (!record) throw new Error('Operation 不存在或已过期');
    return record;
}

export function operationLogs(
    runtime: DeveloperRuntime,
    id: string,
    after = 0,
): OperationLog[] {
    return operationGet(runtime, id).logs
        .filter((log) => log.sequence > after);
}
