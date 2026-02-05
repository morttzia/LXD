import admin from 'firebase-admin';

/**
 * دالة تهيئة Firebase Admin بنظام التنظيف الذكي
 * تقوم باستخراج الـ JSON الصافي وإصلاح رموز السطر الجديد تلقائياً
 */
function getFirestoreDB() {
  if (admin.apps.length > 0) return admin.firestore();

  const rawData = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!rawData) {
    console.error('الخطأ: المتغير FIREBASE_SERVICE_ACCOUNT غير موجود في إعدادات Vercel');
    return null;
  }

  try {
    let cleanJson = rawData.trim();
    
    // إزالة أي علامات اقتباس خارجية قد تضاف عند اللصق في Vercel
    while ((cleanJson.startsWith('"') && cleanJson.endsWith('"')) || 
           (cleanJson.startsWith("'") && cleanJson.endsWith("'"))) {
      cleanJson = cleanJson.slice(1, -1).trim();
    }

    // استخراج محتوى الـ JSON الحقيقي بين أول { وآخر } لتجنب أي نصوص زائدة
    const start = cleanJson.indexOf('{');
    const end = cleanJson.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      cleanJson = cleanJson.substring(start, end + 1);
    }

    const config = JSON.parse(cleanJson);
    
    // إصلاح مشكلة رموز السطر الجديد في المفتاح الخاص ليعمل التشفير بشكل سليم
    if (config.private_key) {
      config.private_key = config.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(config)
    });
    
    return admin.firestore();
  } catch (err) {
    console.error('خطأ في تهيئة Firebase:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  // --- إعدادات CORS للسماح بالوصول من المتصفح ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // معالجة طلبات التحقق المسبق (Preflight)
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getFirestoreDB();

  // فحص الحالة عبر طلب GET
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'online', 
      database: db ? 'ready' : 'failed_to_initialize' 
    });
  }

  // السماح بطلبات POST فقط لمعالجة الأسئلة
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'يرجى استخدام POST' });
  }

  if (!db) {
    return res.status(500).json({ 
      success: false, 
      error: 'فشل السيرفر في الاتصال بقاعدة البيانات. تأكد من إعدادات المفتاح في Vercel.' 
    });
  }

  try {
    // 1. التحقق من الهوية (Bearer Token)
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (!userKey) return res.status(401).json({ success: false, error: 'مفتاح الـ API مفقود' });

    // 2. البحث عن المفتاح في قاعدة البيانات
    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();

    if (snapshot.empty) {
      return res.status(403).json({ success: false, error: 'المفتاح المستخدم غير صالح' });
    }

    const keyDoc = snapshot.docs[0];
    const keyData = keyDoc.data();
    const { prompt } = req.body;

    if (!prompt) return res.status(400).json({ success: false, error: 'نص السؤال مطلوب' });

    // 3. استدعاء الموديل gpt-oss-120b من Cloudflare
    // تأكد من أن الرابط هو رابط الوركر الخاص بك بدون شرطة مائلة في النهاية
    const workerUrl = 'https://lxd.morttzia-me-3600.workers.dev';
    
    const aiRes = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model: "@cf/openai/gpt-oss-120b",
        input: prompt,
        reasoning: { effort: "high" } // تفعيل جهد التفكير العالي للموديل
      })
    });

    const aiData = await aiRes.json();

    if (!aiRes.ok || aiData.errors) {
      throw new Error(aiData.errors?.[0]?.message || 'فشل استدعاء الذكاء الاصطناعي من Cloudflare');
    }

    // 4. استخراج نص الرد الصافي
    let finalResult = '';
    if (aiData.result && aiData.result.response) {
      finalResult = aiData.result.response;
    } else {
      finalResult = typeof aiData.result === 'string' ? aiData.result : JSON.stringify(aiData.result || aiData);
    }

    // 5. تحديث عداد الاستخدام في قاعدة البيانات
    await keyDoc.ref.update({
      calls: (keyData.calls || 0) + 1
    });

    return res.status(200).json({ 
      success: true, 
      result: finalResult 
    });

  } catch (error) {
    console.error('API Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
