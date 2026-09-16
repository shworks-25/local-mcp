/**
 * Database 基础类型定义。
 *
 * 设计原则：
 * - 数据库类型只描述数据库能力，不绑定具体驱动。
 * - SQLite 属于 Embedded Database，不进入 Network Endpoint 抽象。
 * - MySQL/PostgreSQL 后续通过 Adapter 实现。
 */

export type DatabaseType =
    | 'mysql'
    | 'postgres'
    | 'sqlite';

/**
 * 数据库认证来源。
 *
 * 密钥禁止直接保存在配置文件中，只允许通过环境变量运行时读取。
 */
export interface DatabaseCredentials {
    username?: string;
    usernameEnv?: string;
    passwordEnv?: string;
}

/**
 * 网络型数据库连接入口。
 *
 * direct:
 *   直接连接 host/port。
 *
 * ssh:
 *   后续由 Network Endpoint Provider 通过 SSH Tunnel 提供本地入口。
 */
export interface DatabaseEndpointConfig {
    type: 'direct' | 'ssh';
    host?: string;
    port?: number;
    sshConnection?: string;
}

export interface DatabaseConnectionConfig {
    type: DatabaseType;
    environment?: string;
    credentials?: DatabaseCredentials;
    endpoint?: DatabaseEndpointConfig;
    file?: string;
}

export interface DatabaseRegistryConfig {
    connections: Record<string, DatabaseConnectionConfig>;
}
