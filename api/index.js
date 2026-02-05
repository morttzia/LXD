import admin from 'firebase-admin';

/**
 * وظيفة تهيئة Firebase Admin بشكل احترافي
 * تقوم بإصلاح كافة عيوب التنسيق الشائعة في Vercel تلقائياً
 */
function getFirestoreDB() {
  if (admin.apps.length > 0) return admin.firestore();

  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!rawJson) {
    console.error('FIREBASE_SERVICE_ACCOUNT is undefined in Environment Variables');
    return null;
  }

  try {
    // 1. تنظيف النص من أي رموز غريبة أو مسافات في البداية والنهاية
    let cleanJson = rawJson.trim();
    
    // 2. فحص ما إذا كان النص مغلفاً بعلامات اقتباس زائدة (تحدث عند اللصق في Vercel)
    if (cleanJson.startsWith('"') && cleanJson.endsWith('"')) {
      cleanJson = cleanJson.slice(1, -1);
    }

    // 3. تحليل الـ JSON
    let config;
    try {
      config = JSON.parse(cleanJson);
    } catch (e) {
      // محاولة أخيرة في حال كان الـ JSON يحتوي على هروب مزدوج للرموز
      cleanJson = cleanJson.replace(/\\"/g, '"');
      config = JSON.parse(cleanJson);
    }
    
    // 4. إصلاح حاسم للمفتاح الخاص (Private Key)
    // Vercel أحياناً يحول \n إلى \\n مما يفسد التوقيع الرقمي لفايربيس
    if (config.private_key) {
      config.private_key = config.private_key
        .replace(/\\n/g, '\n')
        .replace(/\n/g, '\n'); // التأكد من وجود أسطر حقيقية
    }

    // 5. التحقق من وجود الحقول الأساسية قبل البدء لعدم الانهيار
    if (!config.project_id || !config.private_key || !config.client_email) {
      throw new Error('JSON structure is valid but missing core Firebase fields');
    }

    admin.initializeApp({
      credential: admin.credential.cert(config)
    });
    
    return admin.firestore();
  } catch (err) {
    console.error('FIREBASE_INIT_CRITICAL_ERROR:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  // --- إعدادات CORS الشاملة ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // التعامل مع طلب التحقق المسبق
  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getFirestoreDB();

  // فحص الحالة عبر GET
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'online', 
      database: db ? 'ready' : 'failed_initialization' 
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'يرجى استخدام POST' });
  }

  // إذا فشلت التهيئة، نرسل رداً مفصلاً للمتصفح
  if (!db) {
    return res.status(500).json({ 
      success: false, 
      error: 'Firebase Initialization Failed. Check Vercel Logs for FIREBASE_INIT_CRITICAL_ERROR.' 
    });
  }

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (!userKey) return res.status(401).json({ success: false, error: 'API Key Missing' });

    // 6. استعلام قاعدة البيانات (البحث عن المفتاح)
    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();

    if (snapshot.empty) {
      return res.status(403).json({ success: false, error: 'Invalid API Key' });
    }

    const keyDoc = snapshot.docs[0];
    const keyData = keyDoc.data();
    const { prompt } = req.body;

    if (!prompt) return res.status(400).json({ success: false, error: 'Prompt required' });

    // 7. استدعاء الذكاء الاصطناعي (gpt-oss-120b)
    const aiRes = await fetch('https://lxd.morttzia-me-3600.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "@cf/openai/gpt-oss-120b",
        input: prompt,
        reasoning: { effort: "high" }
      })
    });

    if (!aiRes.ok) throw new Error(`AI Provider returned status ${aiRes.status}`);

    const data = await aiRes.json();

    // 8. تحديث عداد الاستخدام
    await keyDoc.ref.update({ calls: (keyData.calls || 0) + 1 });

    return res.status(200).json({ 
      success: true, 
      result: data.result || data 
    });

  } catch (error) {
    console.error('API_HANDLER_ERROR:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}
