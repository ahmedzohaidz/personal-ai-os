import type { Plan, PlanTask } from './types.js';

export function validateAndSortPlan(plan: Plan): PlanTask[] {
  if (plan.tasks.length === 0) throw new Error('Plan must contain at least one task');
  if (plan.tasks.length > 20) throw new Error('Plan exceeds V1 task limit');

  const byKey = new Map<string, PlanTask>();
  for (const task of plan.tasks) {
    if (!/^[a-z0-9][a-z0-9_-]{0,49}$/i.test(task.key)) {
      throw new Error(`Invalid plan task key: ${task.key}`);
    }
    if (byKey.has(task.key)) throw new Error(`Duplicate plan task key: ${task.key}`);
    byKey.set(task.key, task);
  }

  for (const task of plan.tasks) {
    for (const dependency of task.dependsOn) {
      if (!byKey.has(dependency)) {
        throw new Error(`Unknown dependency ${dependency} for task ${task.key}`);
      }
      if (dependency === task.key) throw new Error(`Task ${task.key} cannot depend on itself`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: PlanTask[] = [];

  function visit(key: string) {
    if (visited.has(key)) return;
    if (visiting.has(key)) throw new Error(`Cyclic plan dependency detected at ${key}`);
    visiting.add(key);
    const task = byKey.get(key)!;
    task.dependsOn.forEach(visit);
    visiting.delete(key);
    visited.add(key);
    ordered.push(task);
  }

  plan.tasks.forEach((task) => visit(task.key));
  return ordered;
}
