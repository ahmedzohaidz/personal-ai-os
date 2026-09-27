import type { AgentContext, AgentProvider } from './contracts.js';
import type { AgentRole, Intake, Plan } from './types.js';

export class DeterministicAgentProvider implements AgentProvider {
  async intake(command: string): Promise<Intake> {
    return {
      title: command.slice(0, 90),
      outcome: command,
      successCriteria: [
        'وجود مخرج نهائي قابل للمراجعة',
        'توثيق الخطوات والقرارات الأساسية',
        'عدم تنفيذ أي إجراء حساس دون موافقة'
      ]
    };
  }

  async plan(input: string): Promise<Plan> {
    return {
      summary: `خطة تنفيذية قابلة للقياس للهدف: ${input}`,
      tasks: [
        {
          key: 'research',
          title: 'جمع الحقائق والمتطلبات',
          objective: 'تحديد المعلومات الناقصة والقيود ومؤشرات النجاح قبل التنفيذ.',
          assignedRole: 'researcher',
          risk: 'read',
          dependsOn: []
        },
        {
          key: 'execute',
          title: 'تنفيذ أول مخرج عملي',
          objective: 'تحويل نتائج البحث إلى مخرج تنفيذي قابل للمراجعة.',
          assignedRole: 'executor',
          risk: 'safe_write',
          dependsOn: ['research']
        }
      ]
    };
  }

  async run(role: AgentRole, input: string, context: AgentContext): Promise<string> {
    if (role === 'researcher') {
      return `تم جمع متطلبات المهمة «${context.task?.title ?? input}» وتحديد القيود ومؤشرات النجاح.`;
    }
    if (role === 'executor') {
      return `تم إنتاج مخرج تنفيذي للمهمة «${context.task?.title ?? input}» بناءً على المعلومات المتاحة.`;
    }
    return `تم تنفيذ ${role}: ${input}`;
  }

  async review(_input: string, context: AgentContext): Promise<{ approved: boolean; summary: string }> {
    const allCompleted = (context.completedTasks ?? []).every((task) => task.state === 'completed');
    return {
      approved: allCompleted,
      summary: allCompleted
        ? 'المراجعة نجحت: جميع المهام اكتملت وحالة المشروع متسقة.'
        : 'المراجعة فشلت: توجد مهام غير مكتملة.'
    };
  }
}
