import {
    spawn,
} from 'node:child_process';

/**
 * 敏感环境变量名称匹配模式。
 * 用于在派生子进程前自动剔除高危鉴权密钥与云凭证。
 */
const SENSITIVE_ENV_KEY_PATTERN =
    /token|secret|password|passwd|auth_token|api_?key|private_key/i;

/**
 * 过滤并净化透传给子进程的环境变量。
 *
 * 核心目的：
 * 防止宿主环境中存储的高权限云服务凭据、API Token 与私密密码被执行脚本静默读取与外发，
 * 同时完整保留开发者系统工具链依赖的基础环境（如 PATH、HOME、语言编码与开发运行时路径）。
 *
 * @param baseEnv 宿主环境原始变量
 * @param customEnv 调用方显式追加的自定义变量
 * @returns 净化后的安全环境变量集合
 */
export function buildSafeProcessEnv(
    baseEnv: NodeJS.ProcessEnv = process.env,
    customEnv?: Record<string, string>,
): NodeJS.ProcessEnv {
    const safeEnv: NodeJS.ProcessEnv = {};

    for (const [key, value] of Object.entries(baseEnv)) {
        if (value === undefined) {
            continue;
        }

        if (SENSITIVE_ENV_KEY_PATTERN.test(key)) {
            continue;
        }

        safeEnv[key] = value;
    }

    if (customEnv) {
        Object.assign(safeEnv, customEnv);
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
