'use client';

import { FormEvent, useMemo, useState } from 'react';

type Approval = {
  id: string;
  taskId: string;
  risk: 'approval' | 'strong_approval';
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
};

type WorkflowResult = {
  idempotencyKey: string;
  state: string;
  goal: { title: string; outcome: string; successCriteria: string[]; status: string };
  project: { title: string; status: string; progress: number };
  tasks: {
    id: string;
    title: string;
    state: string;
    assignedRole: string;
    attempt: number;
    maxAttempts: number;
    output?: string;
  }[];
  runs: { role: string; state: string }[];
  approvals: Approval[];
  finalSummary: string;
  reviewerApproved: boolean;
};

const stateLabel: Record<string, string> = {
  queued: 'في الانتظار',
  running: 'قيد التنفيذ',
  waiting_for_approval: 'بانتظار موافقتك',
  retrying: 'إعادة محاولة',
  completed: 'مكتمل',
  failed: 'فشل',
  cancelled: 'ملغي'
};

export default function DashboardPage() {
  const [command, setCommand] = useState('أطلق مشروعًا تجريبيًا موثوقًا من البداية للنهاية');
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingApprovals = result?.approvals.filter((approval) => approval.status === 'pending') ?? [];
  const completedToday = result?.tasks.filter((task) => task.state === 'completed').length ?? 0;
  const activeRuns = result?.runs.filter((run) => run.state === 'running').length ?? 0;
  const activeProjects = result && !['completed', 'cancelled', 'failed'].includes(result.state) ? 1 : 0;

  const cards = useMemo(() => [
    [String(activeProjects), 'مشاريع نشطة'],
    [String(pendingApprovals.length), 'تحتاج قرارك'],
    [String(activeRuns), 'وكلاء يعملون الآن'],
    [String(completedToday), 'مهام مكتملة']
  ], [activeProjects, activeRuns, completedToday, pendingApprovals.length]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!command.trim()) return;
    setLoading(true);
    setError(null);
    const idempotencyKey = retryKey ?? crypto.randomUUID();
    setRetryKey(idempotencyKey);

    try {
      const response = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ command, idempotencyKey })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'تعذر تنفيذ المهمة');
      setResult(payload);
      setRetryKey(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذر تنفيذ المهمة');
    } finally {
      setLoading(false);
    }
  }

  async function decide(approvalId: string, decision: 'approved' | 'rejected') {
    if (!result) return;
    setApprovalLoading(approvalId);
    setError(null);
    try {
      const response = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey: result.idempotencyKey,
          approvalId,
          decision
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'تعذر تطبيق القرار');
      setResult(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'تعذر تطبيق القرار');
    } finally {
      setApprovalLoading(null);
    }
  }

  return (
    <main className="shell">
      <nav className="mobile-nav" aria-label="التنقل السريع">
        <a href="#command">الأمر</a><a href="#project">المشروع</a><a href="#trace">التنفيذ</a><a href="/diagnostics">الحالة</a>
      </nav>
      <header className="topbar">
        <div>
          <div className="eyebrow">PERSONAL AI OS · V0.4</div>
          <h1>مركز القيادة</h1>
        </div>
        <a className="ghost" href="/diagnostics">حالة النظام</a>
      </header>

      <section className="hero panel" id="command">
        <div className="ready-line"><span className="status-dot" /><span className="muted">Chief of Staff جاهز</span></div>
        <h2>ماذا تريد أن يحدث؟</h2>
        <form onSubmit={submit} className="command-form">
          <textarea
            value={command}
            onChange={(event) => {
              setCommand(event.target.value);
              setRetryKey(null);
            }}
            aria-label="أمر جديد"
            maxLength={4000}
            placeholder="مثال: أريد إطلاق مشروع جديد خلال أسبوعين..."
          />
          <button disabled={loading || !command.trim()}>{loading ? 'جارٍ التنفيذ…' : 'ابدأ المهمة'}</button>
        </form>
        <div className="hero-foot">
          <span>تنفيذ قابل للتدقيق</span>
          <span>موافقات قبل الإجراءات الحساسة</span>
          <span>Idempotency + Retry</span>
        </div>
        {error && <div className="error-box" role="alert">{error}</div>}
      </section>

      <section className="stats" aria-label="ملخص النظام">
        {cards.map(([value, label]) => (
          <article className="stat panel" key={label}><strong>{value}</strong><span>{label}</span></article>
        ))}
      </section>

      {pendingApprovals.length > 0 && (
        <section className="panel attention">
          <div className="section-title">
            <div><span className="kicker">ACTION REQUIRED</span><h3>قرارات تحتاج موافقتك</h3></div>
            <span className="warning-badge">{pendingApprovals.length}</span>
          </div>
          {pendingApprovals.map((approval) => {
            const task = result?.tasks.find((candidate) => candidate.id === approval.taskId);
            return (
              <div className="approval-card" key={approval.id}>
                <div>
                  <strong>{task?.title ?? 'مهمة حساسة'}</strong>
                  <p>{approval.reason}</p>
                  <small>{approval.risk === 'strong_approval' ? 'موافقة قوية' : 'موافقة مطلوبة'}</small>
                </div>
                <div className="approval-actions">
                  <button className="approve" disabled={approvalLoading === approval.id} onClick={() => decide(approval.id, 'approved')}>موافقة</button>
                  <button className="reject" disabled={approvalLoading === approval.id} onClick={() => decide(approval.id, 'rejected')}>رفض</button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="grid" id="project">
        <article className="panel">
          <div className="section-title"><h3>المشروع الحالي</h3><span className="badge">{result ? stateLabel[result.state] ?? result.state : 'لا يوجد'}</span></div>
          {result ? (
            <>
              <h4 className="project-title">{result.project.title}</h4>
              <p className="muted">{result.finalSummary}</p>
              <div className="progress-track"><span style={{ width: `${result.project.progress}%` }} /></div>
              <div className="progress-meta"><span>التقدم</span><strong>{result.project.progress}%</strong></div>
            </>
          ) : (
            <p className="empty">ابدأ بأمر واحد. النظام سيحوّله إلى هدف ومشروع وخطة قابلة للتنفيذ.</p>
          )}
        </article>

        <article className="panel">
          <div className="section-title"><h3>وكلاء V1</h3><span className="badge">5 Agents</span></div>
          {['Chief of Staff', 'Planner', 'Researcher', 'Executor', 'Reviewer'].map((agent) => {
            const normalized = agent.toLowerCase().replaceAll(' ', '_');
            const latest = [...(result?.runs ?? [])].reverse().find((run) => run.role === normalized);
            const done = latest?.state === 'completed';
            return <div className="agent" key={agent}><span className={done ? 'pulse' : 'idle'} />{agent}<small>{done ? 'اكتمل' : 'جاهز'}</small></div>;
          })}
        </article>
      </section>

      {result && (
        <section className="panel result" id="trace">
          <div className="section-title">
            <div><span className="kicker">EXECUTION TRACE</span><h3>مسار التنفيذ</h3></div>
            {result.reviewerApproved && <span className="success">Reviewer ✓</span>}
          </div>
          <div className="criteria">
            {result.goal.successCriteria.map((criterion) => <span key={criterion}>{criterion}</span>)}
          </div>
          <div className="timeline">
            {result.tasks.map((task) => (
              <div key={task.id}>
                <span className={task.state === 'completed' ? 'check' : 'step-dot'}>{task.state === 'completed' ? '✓' : '•'}</span>
                <div className="task-copy">
                  <strong>{task.title}</strong>
                  <small>{task.assignedRole} · {stateLabel[task.state] ?? task.state} · محاولة {task.attempt}/{task.maxAttempts}</small>
                  {task.output && <p>{task.output}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="footer-note">V0.4 · تجربة سحابية مجانية على Vercel، وتخزين محلي دائم على Windows حتى ربط Supabase مستقل.</footer>
    </main>
  );
}
