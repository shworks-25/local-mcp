import type {
    DatabaseConnectionConfig,
    DatabaseRegistryConfig,
} from './types.js';

/**
 * Database Connection Registry。
 *
 * 与 SSH connection profile 保持一致：
 * 用户和 AI 只引用命名 connection，不直接传递密码、私钥等敏感信息。
 *
 * 示例：
 * production-main -> mysql connection
 * analytics       -> postgres connection
 * local-cache     -> sqlite file
 */
export class DatabaseConnectionRegistry {
    private readonly connections: Map<string, DatabaseConnectionConfig>;

    constructor(config: DatabaseRegistryConfig) {
        this.connections = new Map(Object.entries(config.connections));
    }

    /**
     * 返回公开连接摘要。
     * 注意：不返回 passwordEnv 实际值或其他 secret。
     */
    list(): Array<{ name: string; type: string; environment?: string }> {
        return [...this.connections.entries()].map(([name, config]) => ({
            name,
            type: config.type,
            environment: config.environment,
        }));
    }

    /**
     * 根据命名 connection 获取配置。
     * 后续 Resolver 层会负责校验权限和解析 secret。
     */
    get(name: string): DatabaseConnectionConfig {
        const connection = this.connections.get(name);
        if (!connection) {
            throw new Error(`Database connection not found: ${name}`);
        }
        return connection;
    }
}
