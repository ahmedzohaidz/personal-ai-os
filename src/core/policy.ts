import type { RiskLevel } from './types.js';

export function requiresApproval(risk: RiskLevel): boolean {
  return risk === 'approval' || risk === 'strong_approval';
}

export function requiresStrongApproval(risk: RiskLevel): boolean {
  return risk === 'strong_approval';
}
