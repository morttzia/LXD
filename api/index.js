import admin from 'firebase-admin';

/**
 * تهيئة Firebase Admin بنظام التنظيف الشامل
 */
function getFirestoreDB() {
  if (admin.apps.length > 0) return admin.firestore();
  const rawData = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawData) return null;

  try {
    let cleanJson = rawData.trim();
    const start = cleanJson.indexOf('{');
    const end = cleanJson.lastIndexOf('}');
    if (start !== -1 && end !== -1) cleanJson = cleanJson.substring(start, end + 1);
    
    const config = JSON.parse(cleanJson);
    if (config.private_key) config.private_key = config.private_key.replace(/\\n/g, '\n');

    admin.initializeApp({ credential: admin.credential.cert(config) });
    return admin.firestore();
  } catch (err) {
    return null;
  }
}

export default async function handler(req, res) {
  // رؤوس CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getFirestoreDB();
  if (req.method === 'GET') return res.status(200).json({ status: 'online' });
  
  if (!db) return res.status(500).json({ success: false, error: 'Database Error' });

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;
    
    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();
    if (snapshot.empty) return res.status(403).json({ success: false, error: 'Invalid API Key' });

    const keyDoc = snapshot.docs[0];
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: 'Prompt Missing' });

    // --- الرابط مخفي هنا في السيرفر ولا يراه المستخدم أبداً ---
    const workerUrl = 'https://lxd.morttzia-me-3600.workers.dev';
    
    const aiRes = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model: "@cf/openai/gpt-oss-120b",
        input: prompt,
        effort: "medium"
      })
    });

    const aiData = await aiRes.json();

    if (!aiRes.ok) return res.status(502).json({ success: false, error: 'AI Provider Offline' });

    // --- استخراج النص الصافي فقط (إخفاء @cf وكل البيانات التقنية) ---
    let finalCleanText = '';
    
    // محاولة الاستخراج من هيكلية 120b المعقدة
    if (aiData.output && Array.isArray(aiData.output)) {
      const msg = aiData.output.find(o => o.type === 'message');
      if (msg && msg.content && msg.content[0]) {
        finalCleanText = msg.content[0].text;
      }
    }

    // fallback في حال كانت الهيكلية بسيطة
    if (!finalCleanText) {
      finalCleanText = aiData.result?.response || aiData.response || aiData.result || "عذراً، لم أستطع معالجة الرد.";
    }

    // تحديث العداد
    await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });

    // نرسل النتيجة الصافية فقط للمستخدم
    return res.status(200).json({ 
      success: true, 
      result: finalCleanText 
    });

  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
}
