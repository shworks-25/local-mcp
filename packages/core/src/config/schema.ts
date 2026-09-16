import * as z from 'zod/v4';

export const ShellModeSchema = z.enum([
    'disabled',
    'restricted',
    'unrestricted',
]);

export type ShellMode = z.infer<typeof ShellModeSchema>;

export const PermissionsSchema = z.object({
    read: z.boolean().default(true),
    write: z.boolean().default(true),
    delete: z.boolean().default(false),
    shell: ShellModeSchema.default('restricted'),
});

export type Permissions = z.infer<typeof PermissionsSchema>;

export const ProjectPermissionsSchema = z.object({
    read: z.boolean().optional(),
    write: z.boolean().optional(),
    delete: z.boolean().optional(),
    shell: ShellModeSchema.optional(),
});

/**
 * 一个可执行任务。
 *
 * 注意这里刻意没有：
 *
 * command: "go test ./... && rm ..."
 *
 * 而是拆成 program + args。
 *
 * 这样避免 shell 注入。
 */
export const TaskSchema = z.object({
    program: z.string().min(1),

    args: z.array(z.string()).default([]),

    cwd: z.string().default('.'),

    /**
     * 任务运行时注入的自定义业务环境变量。
     */
    env: z
        .record(z.string(), z.string())
        .default({}),

    timeoutMs: z
        .number()
        .int()
        .positive()
        .max(600_000)
        .default(120_000),
});

export type TaskConfig = z.infer<typeof TaskSchema>;

export const SecurityPolicyRuleSchema = z.object({
    action: z.string().min(1),
    decision: z.enum([
        'allow',
        'approval_required',
        'deny',
    ]),
});

export type SecurityPolicyRule = z.infer<typeof SecurityPolicyRuleSchema>;

export const SecuritySchema = z.object({
    policies: z.array(SecurityPolicyRuleSchema).default([]),
});

/**
 * Database Connection Registry 配置。
 *
 * 这里只保存连接声明，不保存密码等 secret。
 * 运行时由 Database Resolver / Secret Provider 负责解析。
 */
export const DatabaseConnectionSchema = z.object({
    type: z.enum(['mysql', 'postgres', 'sqlite']),
    environment: z.string().optional(),
    credentials: z.object({
        username: z.string().optional(),
        usernameEnv: z.string().optional(),
        passwordEnv: z.string().optional(),
    }).optional(),
    endpoint: z.object({
        type: z.enum(['direct', 'ssh']),
        host: z.string().optional(),
        port: z.number().int().min(1).max(65535).optional(),
        sshConnection: z.string().optional(),
    }).optional(),
    file: z.string().optional(),
});

export const DatabaseSchema = z.object({
    connections: z.record(z.string(), DatabaseConnectionSchema).default({}),
});

export type SecurityConfig = z.infer<typeof SecuritySchema>;

export const GlobalConfigSchema = z.object({
    workspaceRoots: z.array(z.string()).default([]),

    autoDiscover: z.boolean().default(false),

    permissions: PermissionsSchema.default({
        read: true,
        write: true,
        delete: false,
        shell: 'restricted',
    }),

    /**
     * Core Security Policy 配置。
     * 数据库、Git、SSH 等高风险能力共享此策略模型。
     */
    security: SecuritySchema.default({
        policies: [],
    }),

    /**
     * AI 禁止通过文件工具读取或修改的高危资产与受保护模式。
     *
     * 涵盖版本控制敏感目录、IDE 自动任务配置、私钥证书、环境密钥以及自身权限配置文件，
     * 避免提示词注入导致的提权或配置篡改。
     */
    protected: z.array(z.string()).default([
        '.git',
        '.git/**',
        '.vscode/**',
        '.idea/**',
        // 环境变量文件通常包含密码、Token 等 secret，因此默认全部保护。
        '.env',
        '.env.*',
        // .env.example 只应包含公开占位值；显式例外允许 AI 维护并提交配置模板。
        '!.env.example',
        '*.pem',
        '*.key',
        '*.p12',
        '*.pfx',
        'id_rsa',
        'id_ed25519',
        // 当前项目配置使用 .shmcp.yaml；旧 .devmcp.yaml 仍可能存在于升级前的工程中，
        // 因此两种真实配置文件都继续受到保护，避免 AI 修改自身权限与远程连接策略。
        '.shmcp.yaml',
        '.devmcp.yaml',
        // examples/.shmcp.yaml 是公开示例配置，不应包含真实凭据；允许 AI 维护文档示例。
        '!examples/.shmcp.yaml',
        // 兼容旧仓库中的示例文件，迁移完成前仍允许维护，但真实项目配置保持受保护。
        '!examples/.devmcp.yaml',
    ]),

    /**
     * restricted shell 模式允许执行的程序白名单。
     *
     * 默认预置常用且标准的主流语言构建与版本控制工具链，
     * 保证开发者安装后拥有开箱即用的顺畅体验，
     * 同时将执行范围严格限制在已知合法工具之内。
     */
    allowedPrograms: z.array(z.string()).default([
        'git',
        'node',
        'npm',
        'pnpm',
        'yarn',
        'go',
        'php',
        'composer',
        'swift',
        'xcodebuild',
        'gradle',
        'flutter',
        'dart',
        'rg',
        'grep',
    ]),

    /**
     * restricted 模式下允许从项目目录执行的相对路径脚本。
     * 与系统程序白名单分离，避免 ./node 等通过 basename 冒充系统工具。
     */
    allowedProjectExecutables: z
        .array(z.string())
        .default([
            './gradlew',
        ]),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

/**
 * SSH 连接配置。
 *
 * SSH 被设计为独立基础能力，而不是数据库的附属实现：未来 MySQL/PostgreSQL
 * 可以通过 connection 名称复用同一条 SSH 配置和隧道生命周期。
 * 凭据本身不写入 YAML；usernameEnv 等字段只保存环境变量名称。
 */
export const SshAuthSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('password'),
        /** 密码只允许引用环境变量，禁止写入 .shmcp.yaml。 */
        passwordEnv: z.string().min(1),
    }),
    z.object({
        type: z.literal('private-key'),
        privateKeyPath: z.string().min(1),
        /** 加密私钥的 passphrase 同样只允许来自 secret 环境变量。 */
        passphraseEnv: z.string().min(1).optional(),
    }),
]);

export const SshConnectionSchema = z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(22),
    username: z.string().min(1).optional(),
    usernameEnv: z.string().min(1).optional(),
    auth: SshAuthSchema,
    /**
     * SHA256 host-key fingerprint，例如 SHA256:xxxx。强制配置可避免自动接受陌生服务器。
     */
    hostKeyFingerprint: z.string().min(1),
    connectTimeoutMs: z.number().int().positive().max(60_000).default(10_000),
    keepAliveIntervalMs: z.number().int().min(0).max(60_000).default(10_000),
    /**
     * 允许 ChatGPT 远程执行的程序白名单。这里保存程序名而不是 shell 命令，
     * 防止调用方通过配置外的任意命令扩大远程执行权限。
     */
    allowedPrograms: z.array(z.string().min(1)).default([]),
}).refine(
    (value) => Boolean(value.username || value.usernameEnv),
    { message: 'SSH 连接必须配置 username 或 usernameEnv' },
);

export type SshConnectionConfig = z.infer<typeof SshConnectionSchema>;

export const ProjectConfigSchema = z.object({
    name: z.string().optional(),

    permissions: ProjectPermissionsSchema.default({}),

    ignore: z.array(z.string()).default([
        '.git',
        'node_modules',
        'vendor',
        'Pods',
        'DerivedData',
        'build',
        'dist',
        '.idea',
        '.vscode',
    ]),

    /**
     * 项目配置只能在全局安全策略之上“追加保护”，不能声明 `!` 例外。
     *
     * `!pattern` 是全局策略内部使用的受控例外语法，例如允许公开的 `.env.example`。
     * 如果项目自身也能声明例外，由于 protected patterns 按顺序裁定，恶意仓库就可以
     * 用 `!.env`、`!.git/**` 等后置规则反向取消全局保护，形成配置级权限提升。
     * 因此这里在配置解析边界直接拒绝所有项目级 `!` 规则，确保项目只能收紧安全边界。
     */
    protected: z.array(
        z.string().refine(
            (pattern) => !pattern.startsWith('!'),
            {
                message: '项目配置禁止使用 ! 解封受保护模式，只能追加保护，不能削弱全局底线',
            },
        ),
    ).default([]),

    commands: z
        .record(
            z.string(),
            TaskSchema,
        )
        .default({}),

    /**
     * 项目可使用的命名 SSH 连接。数据库等上层能力只引用连接名称，
     * 不重复保存跳板机地址、身份或 host-key 策略。
     */
    ssh: z.object({
        connections: z.record(
            z.string(),
            SshConnectionSchema,
        ).default({}),
    }).default({ connections: {} }),

    /**
     * HTTP MCP 服务端配置。
     */
    http: z.object({
        /**
         * 是否允许通过 URL Query 传递鉴权 Token（例如 /mcp?token=xxx）。
         * 出于安全防护考虑（防止反向代理和中间件访问日志明文记录 Token），默认 false。
         */
        allowQueryToken: z.boolean().default(false),
    }).default({ allowQueryToken: false }),
});

export type HttpConfig = z.infer<typeof ProjectConfigSchema>['http'];

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
