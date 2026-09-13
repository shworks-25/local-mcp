import {
    spawn,
} from 'node:child_process';

export interface ProcessOptions {
    cwd?: string;

    timeoutMs?: number;

    maxOutputBytes?: number;
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
                    env: process.env,
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
