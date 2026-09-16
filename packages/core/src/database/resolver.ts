import type { DatabaseConnectionConfig } from './types.js';
import { DatabaseConnectionRegistry } from './registry.js';

/**
 * Database Connection Resolver。
 *
 * Registry 只负责保存连接声明，Resolver 负责运行时解析。
 *
 * 设计目的：
 * - 将配置读取和运行时 secret 解析隔离。
 * - Database Adapter 不需要知道 .env 或配置文件来源。
 * - 后续可以在这里接入权限检查、环境隔离和 Approval Policy。
 */
export class DatabaseConnectionResolver {
    constructor(
        private readonly registry: DatabaseConnectionRegistry,
    ) {}

    /**
     * 根据 connection 名称解析数据库配置。
     *
     * 当前阶段只返回声明配置，不读取 passwordEnv。
     * Secret 解析应由专门的 runtime secret provider 完成，避免敏感信息扩散。
     */
    resolve(name: string): DatabaseConnectionConfig {
        return this.registry.get(name);
    }
}
