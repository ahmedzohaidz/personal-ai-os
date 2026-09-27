# Personal AI OS — V0.4 Clean Room

نظام تشغيل شخصي لإدارة الأهداف والمشاريع وتنفيذ العمل بواسطة وكلاء AI، مبني من الصفر ومستقل بالكامل عن AI Workforce OS.

## الحالة الحالية

المسار المثبت:

`Command → Chief of Staff → Goal → Project → Workflow Run → Planner → Tasks → Agents → Approval/Retry → Reviewer → Result`

V0.4 تعمل بدون أي API مدفوع:

- `DeterministicAgentProvider` للتنفيذ القابل للتكرار.
- تخزين JSON محلي ذري يحافظ على الحالة عبر إعادة التشغيل.
- Workflow Run ID حقيقي ينتقل إلى المهام وتشغيلات الوكلاء والموافقات وسجل الأحداث.
- Idempotency معزول حسب `ownerId`.
- Approval gates + رفض آمن للمهمات الحساسة.
- Retry + Resume + checkpoints.
- واجهة عربية RTL مناسبة للجوال.
- Supabase ExecutionStore جاهز للربط عند تشغيل Supabase Local.
- Supabase schema بنمط Declarative Schema مع RLS وقراءة عميل فقط.

إضافة `OPENAI_API_KEY` تحول طبقة الوكلاء إلى OpenAI Agents SDK دون تغيير منطق الدومين.

## لماذا Supabase Local الآن؟

تمت محاولة إنشاء Supabase Cloud مجاني مستقل، لكن المنظمة المتصلة وصلت حد الخطة المجانية: مشروعان نشطان. لم يتم إيقاف أو تعديل أي مشروع موجود، كما أن Supabase Branch المعروض ليس مجانيًا. لذلك V0.4 تعتمد **Supabase Local** كبيئة التطوير النظيفة ذات التكلفة الصفرية حتى يتوفر cloud slot مجاني.

راجع `docs/SUPABASE_LOCAL.md`.

## الاختبارات المثبتة

`npm test` يغطي حاليًا 11 اختبارًا:

1. Golden Workflow عبر الوكلاء الخمسة.
2. منع تكرار التنفيذ بنفس idempotency key.
3. عزل idempotency keys لكل owner.
4. التوقف عند الموافقة ثم الاستئناف بعد الاعتماد.
5. رفض الموافقة دون تنفيذ المهمة الحساسة.
6. Retry بعد فشل مؤقت.
7. Resume من checkpoint غير نهائي.
8. اكتشاف dependency cycle واعتماد غير موجود.
9. منع انتقال workflow غير صالح.
10. بقاء الحالة في التخزين المحلي بعد إنشاء store جديد.
11. عقد Supabase الأمني: RLS + workflow linkage + منع client writes + عدم تضمين secrets في schema.

## التشغيل المحلي الأساسي

المتطلبات: Node.js 22+ وnpm.

```bash
npm install
npm test
npm run dev
```

ثم افتح `http://localhost:3000` و`/diagnostics`.

> أول `npm install` سينشئ `package-lock.json`. يجب تثبيته في Git قبل أي إطلاق إنتاجي.

## تشغيل Supabase Local

يحتاج container runtime متوافقًا مع Docker API. على Windows شغّل من جذر المشروع:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\bootstrap-local-supabase.ps1
```

لا تجعل `PERSISTENCE_DRIVER=supabase` إلا بعد تشغيل Auth والحصول على URL + Publishable key + Secret key محلية.

## الملفات الحساسة

انسخ `.env.example` إلى `.env.local` فقط عند الحاجة. لا ترفع `.env.local` إلى Git.

- `OPENAI_API_KEY`: اختياري ومدفوع حسب الاستهلاك.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: مفتاح عام منخفض الصلاحيات.
- `SUPABASE_SECRET_KEY`: خادمي فقط؛ لا يجوز وضعه في المتصفح.
- `PERSISTENCE_DRIVER`: `local` افتراضيًا، أو `supabase` بعد اكتمال Auth.

## Supabase architecture

المخطط المصدر موجود في `supabase/schemas/01_core.sql`.

النموذج الأمني الحالي:

- RLS على كل جداول `public` الخاصة بالتطبيق.
- المستخدم المسجل يستطيع القراءة فقط من صفوفه.
- mutations تمر عبر API server بعد التحقق من الهوية.
- الـSecret key خادمي فقط.
- `workflow_runs.checkpoint` يحفظ snapshot قابلًا للاستئناف، مع جداول normalized للبحث والتحليل والتدقيق.

## مبدأ المشروع

وجود الكود لا يعني أن الميزة تعمل. كل ميزة يجب أن يكون لها إثبات اختبار أو تشخيص واضح قبل وصفها بأنها جاهزة.


## Vercel zero-cost demo

When deployed to Vercel without a dedicated Supabase project, the app intentionally uses ephemeral in-memory persistence and deterministic agents. Windows/local mode keeps durable JSON persistence. Configure `PERSISTENCE_DRIVER=supabase` only after a dedicated Supabase instance is available.
