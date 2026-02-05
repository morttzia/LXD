import admin from 'firebase-admin';

/**
 * تهيئة Firebase Admin بنظام التنظيف الشامل
 * يعالج مشكلة الاقتباسات المزدوجة والمفردة والرموز المخفية
 */
function getFirestoreDB() {
  if (admin.apps.length > 0) return admin.firestore();

  const rawData = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (!rawData) {
    console.error('DEBUG: FIREBASE_SERVICE_ACCOUNT is missing');
    return null;
  }

  try {
    let cleanJson = rawData.trim();
    
    // طباعة أول 30 حرف لمراقبة Logs في Vercel
    console.log("DEBUG: Processing string starting with:", cleanJson.substring(0, 30));

    // 1. إزالة أي علامات اقتباس خارجية (مزدوجة أو مفردة) قد تكون أُضيفت بالخطأ
    // نكرر العملية للتأكد من إزالة كافة الطبقات
    while ((cleanJson.startsWith('"') && cleanJson.endsWith('"')) || 
           (cleanJson.startsWith("'") && cleanJson.endsWith("'"))) {
      cleanJson = cleanJson.slice(1, -1).trim();
    }

    // 2. محاولة استخراج محتوى الـ JSON إذا كان محاطاً بنصوص
    const startChar = cleanJson.indexOf('{');
    const endChar = cleanJson.lastIndexOf('}');
    if (startChar !== -1 && endChar !== -1) {
      cleanJson = cleanJson.substring(startChar, endChar + 1);
    }

    // 3. تحليل الـ JSON النهائي
    const config = JSON.parse(cleanJson);
    
    // 4. إصلاح المفتاح الخاص (استبدال الهروب بأسطر حقيقية)
    if (config.private_key) {
      config.private_key = config.private_key.replace(/\\n/g, '\n');
    }

    // 5. التشغيل
    admin.initializeApp({
      credential: admin.credential.cert(config)
    });
    
    return admin.firestore();
  } catch (err) {
    console.error('FIREBASE_INIT_ERROR:', err.message);
    return null;
  }
}

export default async function handler(req, res) {
  // رؤوس CORS الشاملة
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getFirestoreDB();

  // فحص الحالة
  if (req.method === 'GET') {
    return res.status(200).json({ 
      status: 'online', 
      database: db ? 'ready' : 'failed_initialization' 
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!db) {
    return res.status(500).json({ 
      success: false, 
      error: 'Firebase Init Failed. تأكد من لصق الكود الصافي في Vercel بدون اقتباسات.' 
    });
  }

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (!userKey) return res.status(401).json({ success: false, error: 'Key Missing' });

    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();

    if (snapshot.empty) return res.status(403).json({ success: false, error: 'Invalid Key' });

    const keyDoc = snapshot.docs[0];
    const { prompt } = req.body;

    if (!prompt) return res.status(400).json({ success: false, error: 'Prompt Missing' });

    // استدعاء AI
    const aiRes = await fetch('https://lxd.morttzia-me-3600.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "@cf/openai/gpt-oss-120b",
        input: prompt,
        reasoning: { effort: "high" }
      })
    });

    const data = await aiRes.json();
    await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });

    return res.status(200).json({ success: true, result: data.result || data });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
