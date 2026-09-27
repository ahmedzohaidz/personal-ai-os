import { proxyActivities } from '@temporalio/workflow';

export interface ProjectWorkflowInput {
  ownerId: string;
  command: string;
  idempotencyKey: string;
}

export interface ProjectActivities {
  createAndPlan(input: ProjectWorkflowInput): Promise<{ projectId: string; taskIds: string[] }>;
  executeTask(input: { projectId: string; taskId: string }): Promise<void>;
  reviewProject(input: { projectId: string }): Promise<{ approved: boolean }>;
}

const activities = proxyActivities<ProjectActivities>({
  startToCloseTimeout: '10 minutes',
  retry: {
    initialInterval: '2 seconds',
    backoffCoefficient: 2,
    maximumInterval: '1 minute',
    maximumAttempts: 4
  }
});

export async function projectWorkflow(input: ProjectWorkflowInput): Promise<{ projectId: string; approved: boolean }> {
  const { projectId, taskIds } = await activities.createAndPlan(input);
  for (const taskId of taskIds) {
    await activities.executeTask({ projectId, taskId });
  }
  const review = await activities.reviewProject({ projectId });
  return { projectId, approved: review.approved };
}
