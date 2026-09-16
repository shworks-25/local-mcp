export type PolicyDecision = 'allow' | 'approval_required' | 'deny';

export interface PolicyContext {
    environment?: string;
    connection?: string;
    action: string;
    risk?: 'low' | 'medium' | 'high';
}

export interface PolicyRule {
    action: string;
    decision: PolicyDecision;
}

export function evaluatePolicy(
    context: PolicyContext,
    rules: PolicyRule[],
): PolicyDecision {
    const matched = rules.find((rule) => rule.action === context.action);
    return matched?.decision ?? 'deny';
}
