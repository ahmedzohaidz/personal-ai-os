import { Agent, run } from '@openai/agents';
import { z } from 'zod';
import type { AgentContext, AgentProvider } from '../../core/contracts.js';
import type { AgentRole, Intake, Plan } from '../../core/types.js';

const IntakeSchema = z.object({
  title: z.string().min(1).max(120),
  outcome: z.string().min(1).max(4000),
  successCriteria: z.array(z.string().min(1).max(300)).min(1).max(8)
});

const PlanSchema = z.object({
  summary: z.string().min(1).max(2000),
  tasks: z.array(z.object({
    key: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,49}$/i),
    title: z.string().min(1).max(180),
    objective: z.string().min(1).max(1500),
    assignedRole: z.enum(['researcher', 'executor']),
    risk: z.enum(['read', 'safe_write', 'approval', 'strong_approval']),
    dependsOn: z.array(z.string()).max(10)
  })).min(1).max(20)
});

const ReviewSchema = z.object({
  approved: z.boolean(),
  summary: z.string().min(1).max(2000)
});

const instructions: Record<AgentRole, string> = {
  chief_of_staff: 'You are an executive chief of staff. Convert the user command into a precise outcome and measurable success criteria. Do not invent facts.',
  planner: 'You are a project planner. Decompose the goal into the smallest dependency-aware, verifiable tasks. Use only researcher and executor task roles. Escalate risky side effects through the risk field.',
  researcher: 'You are a research agent. Gather only relevant evidence, distinguish facts from assumptions, and do not perform external writes.',
  executor: 'You are an execution agent. Produce concrete scoped outputs. Never claim an external side effect occurred unless a tool result proves it.',
  reviewer: 'You are an independent reviewer. Check completeness, consistency, evidence, unmet acceptance criteria, and whether success criteria were actually satisfied.'
};

function modelConfig() {
  return process.env.OPENAI_MODEL ? { model: process.env.OPENAI_MODEL } : {};
}

export class OpenAIAgentProvider implements AgentProvider {
  async intake(command: string): Promise<Intake> {
    const agent = new Agent({
      name: 'Chief of Staff',
      instructions: instructions.chief_of_staff,
      outputType: IntakeSchema,
      ...modelConfig()
    });
    const result = await run(agent, command, { maxTurns: 4 });
    if (!result.finalOutput) throw new Error('Chief of Staff returned no structured output');
    return result.finalOutput;
  }

  async plan(input: string, context: AgentContext): Promise<Plan> {
    const agent = new Agent({
      name: 'Planner',
      instructions: instructions.planner,
      outputType: PlanSchema,
      ...modelConfig()
    });
    const prompt = [
      `Outcome: ${input}`,
      `Success criteria: ${(context.goal?.successCriteria ?? []).join(' | ')}`,
      'Keep the plan minimal. Dependencies must reference task keys and must be acyclic.'
    ].join('\n');
    const result = await run(agent, prompt, { maxTurns: 4 });
    if (!result.finalOutput) throw new Error('Planner returned no structured output');
    return result.finalOutput;
  }

  async run(role: AgentRole, input: string, context: AgentContext): Promise<string> {
    const agent = new Agent({
      name: role,
      instructions: instructions[role],
      ...modelConfig()
    });
    const prompt = [
      input,
      context.task ? `Task: ${context.task.title}` : '',
      context.goal ? `Goal: ${context.goal.outcome}` : '',
      'Return only the concrete work result. Do not fabricate tool execution.'
    ].filter(Boolean).join('\n');
    const result = await run(agent, prompt, { maxTurns: 6 });
    return String(result.finalOutput ?? '');
  }

  async review(input: string, context: AgentContext): Promise<{ approved: boolean; summary: string }> {
    const agent = new Agent({
      name: 'Reviewer',
      instructions: instructions.reviewer,
      outputType: ReviewSchema,
      ...modelConfig()
    });
    const completed = context.completedTasks?.map((task) =>
      `- ${task.title}: state=${task.state}; output=${task.output ?? ''}`
    ).join('\n') ?? '';
    const prompt = [
      `Plan: ${input}`,
      `Success criteria: ${(context.goal?.successCriteria ?? []).join(' | ')}`,
      `Completed work:\n${completed}`
    ].join('\n');
    const result = await run(agent, prompt, { maxTurns: 4 });
    if (!result.finalOutput) throw new Error('Reviewer returned no structured output');
    return result.finalOutput;
  }
}
