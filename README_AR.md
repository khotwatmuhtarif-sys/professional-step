# إشعارات خطوة محترف اليومية عبر GitHub Actions

الملفات في هذه الحزمة جاهزة لتنفيذ التنبيهات التالية تلقائياً:

1. الزيارة المجدولة: قبلها بـ 6 أيام، ومرة أخرى قبلها بيوم.
2. العقد: قبل انتهائه بـ 15 يوماً، ومرة أخرى بعد انتهاء العقد بيوم.
3. الدفعة: تعتبر متأخرة بعد مرور 3 أيام كاملة على تاريخ الاستحقاق، ويرسل النظام تنبيهاً مرة واحدة عند اكتشافها متأخرة.

## أين ترفع الملفات؟

انسخ إلى مستودع GitHub نفسه:

- `.github/workflows/daily-notifications.yml`
- `scripts/daily-notifications.js`
- `package.json`

## GitHub Secrets المطلوبة

من المستودع: Settings → Secrets and variables → Actions → New repository secret

أنشئ الأسرار التالية حرفياً:

- `GREEN_API_ID_INSTANCE` = رقم Instance في Green API.
- `GREEN_API_TOKEN` = Token الخاص بالـ Instance.
- `GREEN_API_GROUP_ID` = رقم الجروب كاملاً وينتهي بـ `@g.us`.
- `FIREBASE_SERVICE_ACCOUNT` = محتوى ملف Service Account JSON كاملاً من Firebase/Google Cloud.

لا تضع Token أو Service Account داخل ملفات GitHub العامة.

## الحصول على Firebase Service Account

من Firebase Console افتح إعدادات المشروع ثم Service accounts، وأنشئ Private key جديداً. افتح ملف JSON الذي يتم تنزيله وانسخ محتواه كاملاً إلى Secret باسم `FIREBASE_SERVICE_ACCOUNT`.

## وقت التشغيل

الـ Action مضبوط حالياً على الساعة 08:00 صباحاً بتوقيت السعودية يومياً.
كما يمكن تشغيله يدوياً من GitHub: Actions → Daily WhatsApp Notifications → Run workflow.

## منع تكرار الرسائل

بعد إرسال أي تنبيه، يسجل السكربت الحدث تحت `notificationLog` في Firebase. لذلك تشغيل الـ Action يدوياً أكثر من مرة في اليوم لا يعيد نفس التنبيه.

## صيغة الرسائل

الرسائل مختصرة عربي / English، مثل:

🔔 تذكير زيارة / Visit Reminder
👤 العميل / Customer: اسم العميل
📄 العقد / Contract: #123
📅 الزيارة / Visit: 4 / 12
🗓️ الموعد / Date: 2026-09-11
⏳ المتبقي / Remaining: 6 Days
