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
     * AI 不允许通过文件工具直接读取这些文件。
     *
     * .devmcp.yaml 也保护起来，
     * 防止 AI 自己修改自己的权限。
     */
    protected: z.array(z.string()).default([
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
     * restricted shell 模式允许执行的程序。
     */
    allowedPrograms: z.array(z.string()).default([
        'git',

        'node',
        'npm',
        'npx',
        'pnpm',
        'yarn',

        'go',

        'php',
        'composer',

        'swift',
        'xcodebuild',

        'gradle',
        './gradlew',

        'flutter',
        'dart',

        'rg',
        'grep',
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
