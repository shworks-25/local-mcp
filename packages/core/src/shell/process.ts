import {
    spawn,
} from 'node:child_process';

/**
 * 子进程默认只继承明确允许的基础环境变量。
 *
 * 采用 allowlist 而不是凭据名称 denylist，避免遗漏 SSH Agent、云平台、
 * Kubernetes、Docker 等并不一定包含 token/secret 字样的高权限环境变量。
 */
const SAFE_ENV_KEYS = new Set([
    // 基础系统与终端环境
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'LANG',
    'TERM',
    'TMPDIR',
    'TMP',
    'TEMP',
    'CI',
    'COLORTERM',
    'FORCE_COLOR',

    // Node.js 与包管理工具链
    'NODE_ENV',
    'NVM_DIR',
    'NVM_BIN',
    'VOLTA_HOME',
    'COREPACK_HOME',
    'PNPM_HOME',

    // Go 语言工具链
    'GOPATH',
    'GOROOT',
    'GOPROXY',
    'GONOSUMDB',
    'GOPRIVATE',

    // Rust 与 Cargo 工具链
    'CARGO_HOME',
    'RUSTUP_HOME',

    // Python 与 Java 工具链
    'VIRTUAL_ENV',
    'JAVA_HOME',
    'GRADLE_USER_HOME',
]);

function isSafeEnvKey(key: string): boolean {
    return (
        SAFE_ENV_KEYS.has(key) ||
        key.startsWith('LC_')
    );
}

const SENSITIVE_CUSTOM_ENV_KEY_PATTERN =
    /token|secret|password/i;

function isSafeCustomEnvKey(key: string): boolean {
    return !SENSITIVE_CUSTOM_ENV_KEY_PATTERN.test(key);
}

/**
 * 构造最小化的子进程环境。
 *
 * @param baseEnv 宿主环境原始变量，仅允许基础 allowlist
 * @param customEnv 调用方显式追加的自定义变量，仅过滤明显敏感凭据键
 * @returns 最小化的宿主环境 + 显式任务环境变量集合
 */
export function buildSafeProcessEnv(
    baseEnv: NodeJS.ProcessEnv = process.env,
    customEnv?: Record<string, string>,
): NodeJS.ProcessEnv {
    const safeEnv: NodeJS.ProcessEnv = {};

    for (const [key, value] of Object.entries(baseEnv)) {
        if (
            value !== undefined &&
            isSafeEnvKey(key)
        ) {
            safeEnv[key] = value;
        }
    }

    if (customEnv) {
        for (const [key, value] of Object.entries(customEnv)) {
            if (isSafeCustomEnvKey(key)) {
                safeEnv[key] = value;
            }
        }
    }

    return safeEnv;
}

export interface ProcessOptions {
    cwd?: string;

    timeoutMs?: number;

    maxOutputBytes?: number;

    env?: Record<string, string>;
}

export interface ProcessResult {
    code: number;

    stdout: string;

    stderr: string;

    timedOut: boolean;
}

export async function runProcess(
    program: string,
    args: string[],
    options: ProcessOptions = {},
): Promise<ProcessResult> {
    const timeoutMs =
        options.timeoutMs ??
        120_000;

    const maxOutputBytes =
        options.maxOutputBytes ??
        2_000_000;

    const safeEnv =
        buildSafeProcessEnv(
            process.env,
            options.env,
        );

    return await new Promise(
        (
            resolve,
            reject,
        ) => {
            const child = spawn(
                program,
                args,
                {
                    cwd:
                    options.cwd,
                    shell: false,
                    env: safeEnv,
                    stdio: [
                        'ignore',
                        'pipe',
                        'pipe',
                    ],
                },
            );

            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let settled = false;

            const append = (
                current: string,
                chunk: Buffer,
            ): string => {
                if (
                    Buffer.byteLength(
                        current,
                    ) >= maxOutputBytes
                ) {
                    return current;
                }

                const remaining =
                    maxOutputBytes -
                    Buffer.byteLength(
                        current,
                    );

                return (
                    current +
                    chunk
                        .subarray(
                            0,
                            remaining,
                        )
                        .toString('utf8')
                );
            };

            child.stdout.on(
                'data',
                (chunk: Buffer) => {
                    stdout = append(
                        stdout,
                        chunk,
                    );
                },
            );

            child.stderr.on(
                'data',
                (chunk: Buffer) => {
                    stderr = append(
                        stderr,
                        chunk,
                    );
                },
            );

            const timer =
                setTimeout(
                    () => {
                        timedOut = true;

                        child.kill(
                            'SIGTERM',
                        );
                    },
                    timeoutMs,
                );

            child.on(
                'error',
                (error) => {
                    clearTimeout(timer);

                    if (settled) {
                        return;
                    }

                    settled = true;
                    reject(error);
                },
            );

            child.on(
                'close',
                (code) => {
                    clearTimeout(timer);

                    if (settled) {
                        return;
                    }

                    settled = true;

                    resolve({
                        code:
                            code ?? -1,
                        stdout,
                        stderr,
                        timedOut,
                    });
                },
            );
        },
    );
}
