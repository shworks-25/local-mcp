import {
    chmod,
    lstat,
    mkdir,
    readFile,
    writeFile,
} from 'node:fs/promises';

import {
    homedir,
} from 'node:os';

import {
    join,
} from 'node:path';

import {
    parse,
    stringify,
} from 'yaml';

import {
    GlobalConfigSchema,
    ProjectConfigSchema,
    type GlobalConfig,
    type ProjectConfig,
} from './schema.js';

export const CONFIG_DIR = join(
    homedir(),
    '.config',
    'shworks-devkit',
);

export const GLOBAL_CONFIG_PATH = join(
    CONFIG_DIR,
    'config.yaml',
);

export const PROJECT_REGISTRY_PATH = join(
    CONFIG_DIR,
    'projects.yaml',
);

export async function ensureConfigDir(): Promise<void> {
    await mkdir(CONFIG_DIR, {
        recursive: true,
        mode: 0o700,
    });

    await chmod(CONFIG_DIR, 0o700);
}

async function readYamlFile(
    file: string,
): Promise<unknown | undefined> {
    try {
        const content = await readFile(
            file,
            'utf8',
        );

        return parse(content);
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;

        if (nodeError.code === 'ENOENT') {
            return undefined;
        }

        throw error;
    }
}

export async function loadGlobalConfig(): Promise<GlobalConfig> {
    const raw = await readYamlFile(
        GLOBAL_CONFIG_PATH,
    );

    return GlobalConfigSchema.parse(
        raw ?? {},
    );
}

export async function saveGlobalConfig(
    config: GlobalConfig,
): Promise<void> {
    await ensureConfigDir();

    const parsed =
        GlobalConfigSchema.parse(config);

    await writeFile(
        GLOBAL_CONFIG_PATH,
        stringify(parsed),
        {
            encoding: 'utf8',
            mode: 0o600,
        },
    );

    await chmod(GLOBAL_CONFIG_PATH, 0o600);
}

export async function loadProjectConfig(
    projectRoot: string,
): Promise<ProjectConfig> {
    /**
     * `shmcp` 是当前对外暴露的 MCP 命令，因此项目级配置统一使用 `.shmcp.yaml`。
     *
     * 旧版本曾使用 `.devmcp.yaml`。这里保留只读兼容：优先读取新文件；只有新文件
     * 不存在时才回退到旧文件。这样升级 shmcp 不会让已有工程立即丢失配置，同时
     * 新工程和文档都可以统一迁移到新的命名。
     */
    const candidates = [
        '.shmcp.yaml',
        '.devmcp.yaml',
    ] as const;

    for (const filename of candidates) {
        const file = join(projectRoot, filename);

        try {
            const info = await lstat(file);
            if (info.isSymbolicLink()) {
                throw new Error(
                    `${filename} 不允许使用符号链接`,
                );
            }
        } catch (error) {
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError.code === 'ENOENT') {
                continue;
            }
            throw error;
        }

        const raw = await readYamlFile(file);
        return ProjectConfigSchema.parse(raw ?? {});
    }

    return ProjectConfigSchema.parse({});
}

export function expandHomePath(
    input: string,
): string {
    if (input === '~') {
        return homedir();
    }

    if (input.startsWith('~/')) {
        return join(
            homedir(),
            input.slice(2),
        );
    }

    return input;
}
