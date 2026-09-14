import {
    randomUUID,
} from 'node:crypto';

export type RuntimeCleanup =
    () => void | Promise<void>;

export class DeveloperRuntime {
    readonly id = randomUUID();
    readonly createdAt = new Date().toISOString();

    private readonly stores =
        new Map<string, unknown>();

    private readonly cleanups =
        new Set<RuntimeCleanup>();

    getStore<T>(
        key: string,
        factory: () => T,
    ): T {
        if (!this.stores.has(key)) {
            this.stores.set(
                key,
                factory(),
            );
        }

        return this.stores.get(key) as T;
    }

    registerCleanup(
        cleanup: RuntimeCleanup,
    ): () => void {
        this.cleanups.add(cleanup);

        return () => {
            this.cleanups.delete(cleanup);
        };
    }

    async reset(): Promise<void> {
        const callbacks = [
            ...this.cleanups,
        ];

        this.cleanups.clear();

        let firstError: unknown;

        for (const cleanup of callbacks) {
            try {
                await cleanup();
            } catch (error) {
                firstError ??= error;
            }
        }

        this.stores.clear();

        if (firstError) {
            throw firstError;
        }
    }

    status(): {
        id: string;
        createdAt: string;
        stores: Array<{
            key: string;
            entries?: number;
        }>;
    } {
        return {
            id: this.id,
            createdAt: this.createdAt,
            stores: [...this.stores.entries()]
                .map(([key, value]) => ({
                    key,
                    entries:
                        value instanceof Map ||
                        value instanceof Set
                            ? value.size
                            : Array.isArray(value)
                                ? value.length
                                : undefined,
                }))
                .sort((left, right) =>
                    left.key.localeCompare(right.key),
                ),
        };
    }

    capabilities(): {
        scope: 'developer-runtime';
        isolation: string;
        authenticationBoundary: string;
        stateful: string[];
        execution: string[];
        analysis: string[];
        recovery: string[];
    } {
        return {
            scope: 'developer-runtime',
            isolation:
                'one runtime per stdio connection or HTTP server authentication principal',
            authenticationBoundary:
                'Clients sharing the same HTTP server and Bearer token share one Developer Runtime; local loopback without auth shares the server runtime',
            stateful: [
                'test result cache',
                'dev process manager',
                'workspace snapshots',
            ],
            execution: [
                'test',
                'typecheck',
                'lint',
                'package script',
                'predefined dev task',
            ],
            analysis: [
                'symbol definition/reference',
                'security scan',
                'runtime status',
            ],
            recovery: [
                'workspace snapshot',
                'restore preview',
                'workspace restore',
                'runtime reset',
            ],
        };
    }
}
