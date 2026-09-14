import type {
    ResolvedProject,
} from '../project/resolver.js';

import {
    packageScripts,
} from '../package/scripts.js';

import {
    searchText,
} from '../filesystem/search.js';

export interface SecurityFinding {
    severity:
        | 'high'
        | 'medium'
        | 'low'
        | 'info';
    category: string;
    message: string;
    evidence?: string;
}

const RISKY_SCRIPT_PATTERN =
    /\b(?:curl|wget)\b.*\|\s*(?:sh|bash)|\bsudo\b|\brm\s+-rf\b|\bchmod\s+777\b|\bnpx\b/i;

const CODE_PATTERNS: Array<{
    query: string;
    category: string;
    message: string;
    severity: SecurityFinding['severity'];
}> = [
    {
        query: /eval\s*\(/.source,
        category: 'dynamic-code',
        message: '发现 eval() 动态代码执行',
        severity: 'medium',
    },
    {
        query: /child_process|execSync\s*\(|spawnSync\s*\(/.source,
        category: 'process-execution',
        message: '发现子进程执行相关代码',
        severity: 'low',
    },
    {
        query: /http:\/\/0\.0\.0\.0|listen\s*\(\s*0\.0\.0\.0/.source,
        category: 'network-exposure',
        message: '发现可能的全网卡监听配置',
        severity: 'low',
    },
];

const SECRET_PATTERNS = [
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /(?:api[_-]?key|secret|password)\s*[:=]\s*["'][^"']{8,}/i,
].map((pattern) => pattern.source);

function isTestPath(path: string): boolean {
    return /(?:^|[/\\])(?:test|tests|__tests__|scratch|spec|specs)(?:[/\\]|$)|(?:\.|\b)(?:test|spec)\.[a-zA-Z0-9]+$/i.test(
        path,
    );
}

function redactLocation(
    rgLine: string,
): string {
    const location =
        rgLine.match(
            /^(.+?):(\d+):(\d+):/,
        );

    if (!location) {
        return '[redacted location]';
    }

    return `${location[1]}:${location[2]}`;
}

export async function securityScan(
    project: ResolvedProject,
): Promise<{
    findings: SecurityFinding[];
    summary: Record<string, number>;
}> {
    const findings: SecurityFinding[] = [];

    const scanProject: ResolvedProject = {
        ...project,
        ignorePatterns: [],
    };

    if (
        project.permissions.shell ===
        'unrestricted'
    ) {
        findings.push({
            severity: 'high',
            category: 'permissions',
            message: '项目启用了 unrestricted shell',
        });
    }

    if (!project.record.trusted) {
        findings.push({
            severity: 'info',
            category: 'trust',
            message: '项目当前为 untrusted，任务执行已被阻止',
        });
    }

    for (
        const [name, task]
        of Object.entries(
            project.config.commands,
        )
    ) {
        if (
            RISKY_SCRIPT_PATTERN.test(
                [
                    task.program,
                    ...task.args,
                ].join(' '),
            )
        ) {
            findings.push({
                severity: 'high',
                category: 'task',
                message:
                    `任务 ${name} 包含高风险命令模式`,
                evidence:
                    `program=${task.program}; args=[redacted]`,
            });
        }
    }

    try {
        const pkg =
            await packageScripts(project);

        for (
            const [name, script]
            of Object.entries(pkg.scripts)
        ) {
            if (
                RISKY_SCRIPT_PATTERN.test(
                    script,
                )
            ) {
                findings.push({
                    severity: 'medium',
                    category: 'package-script',
                    message:
                        `package script ${name} 包含高风险模式`,
                    evidence:
                        `script=${name}; content=[redacted]`,
                });
            }
        }
    } catch {
        // 非 Node.js 项目可以忽略。
    }

    for (const pattern of CODE_PATTERNS) {
        const result =
            await searchText(
                scanProject,
                pattern.query,
                20,
            );

        for (
            const line
            of result.output.slice(0, 10)
        ) {
            const loc = line.match(/^(.+?):(\d+):(\d+):/);
            const inTest = loc ? isTestPath(loc[1]!) : false;

            findings.push({
                severity: inTest ? 'info' : pattern.severity,
                category: pattern.category,
                message: inTest
                    ? `${pattern.message}（测试/示例代码）`
                    : pattern.message,
                evidence: redactLocation(line),
            });
        }
    }

    const combinedSecretQuery = SECRET_PATTERNS.join('|');
    const secretResult =
        await searchText(
            scanProject,
            combinedSecretQuery,
            30,
        );

    for (
        const line
        of secretResult.output.slice(0, 15)
    ) {
        const loc = line.match(/^(.+?):(\d+):(\d+):/);
        const inTest = loc ? isTestPath(loc[1]!) : false;

        findings.push({
            severity: inTest ? 'low' : 'high',
            category: 'credential',
            message: inTest
                ? '在测试夹具/测试文件中发现疑似示例凭据'
                : '发现疑似硬编码凭据；为避免泄露，仅返回位置',
            evidence:
                redactLocation(line),
        });
    }

    const summary = {
        high: findings.filter(
            (finding) =>
                finding.severity === 'high',
        ).length,
        medium: findings.filter(
            (finding) =>
                finding.severity === 'medium',
        ).length,
        low: findings.filter(
            (finding) =>
                finding.severity === 'low',
        ).length,
        info: findings.filter(
            (finding) =>
                finding.severity === 'info',
        ).length,
    };

    return {
        findings,
        summary,
    };
}
