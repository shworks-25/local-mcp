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
        '.env',
        '.env.*',
        '*.pem',
        '*.key',
        '*.p12',
        '*.pfx',
        'id_rsa',
        'id_ed25519',
        '.devmcp.yaml',
    ]),

    /**
     * restricted shell 模式允许执行的程序白名单。
     *
     * 默认预置常用且标准的主流语言构建与版本控制工具链，
     * 保证开发者通过 Homebrew 安装后拥有开箱即用的顺畅体验，
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

    protected: z.array(z.string()).default([]),

    commands: z
        .record(
            z.string(),
            TaskSchema,
        )
        .default({}),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
