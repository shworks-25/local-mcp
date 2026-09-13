import {
    chmod,
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
    const file = join(
        projectRoot,
        '.devmcp.yaml',
    );

    const raw = await readYamlFile(file);

    return ProjectConfigSchema.parse(
        raw ?? {},
    );
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
