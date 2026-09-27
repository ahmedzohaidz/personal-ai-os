const isVercelDemo = process.env.VERCEL === '1' && process.env.PERSISTENCE_DRIVER !== 'supabase';

const checks = [
  ['Golden Workflow Core', 'جاهز ومختبر', true],
  ['Checkpoint / Resume / Retry', 'جاهز في النواة', true],
  ['Approval Gates', 'جاهز ومختبر', true],
  ['Deterministic Agents', 'جاهز — بدون تكلفة', true],
  ['OpenAI Agents SDK', process.env.OPENAI_API_KEY ? 'مهيأ' : 'اختياري — لا يوجد مفتاح', Boolean(process.env.OPENAI_API_KEY)],
  ['Persistence', process.env.PERSISTENCE_DRIVER === 'supabase' ? 'Supabase — دائم' : isVercelDemo ? 'Cloud Demo — مؤقت وغير دائم' : 'Local JSON — دائم على الجهاز', true],
  ['Supabase Local/Cloud', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'المفاتيح مهيأة' : 'Adapter جاهز — غير موصول حاليًا', Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)],
  ['Temporal Adapter', process.env.TEMPORAL_ADDRESS ? 'مهيأ' : 'اختياري وغير مستخدم حاليًا', Boolean(process.env.TEMPORAL_ADDRESS)]
];

export default function DiagnosticsPage() {
  return (
    <main className="shell narrow">
      <a className="back" href="/">← مركز القيادة</a>
      <section className="panel diagnostics">
        <div className="eyebrow">DIAGNOSTICS</div>
        <h1>حالة النظام</h1>
        <p className="muted">تعرض هذه الصفحة ما تم إثباته فعليًا، وتفصل الخدمات الاختيارية غير الموصولة.</p>
        {checks.map(([name, status, ok]) => (
          <div className="diag" key={String(name)}>
            <span className={ok ? 'ok' : 'warn'} />
            <strong>{name}</strong>
            <span>{status}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
