import admin from 'firebase-admin';

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
  } catch (err) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const db = getFirestoreDB();
  if (req.method === 'GET') return res.status(200).json({ status: 'active' });
  
  if (!db) return res.status(500).json({ success: false, error: 'System initializing...' });

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;
    
    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();
    if (snapshot.empty) return res.status(403).json({ success: false, error: 'Access Denied: Invalid Token' });

    const keyDoc = snapshot.docs[0];
    const { prompt } = req.body; // لم نعد نطلب 'model' من الفرونت إند
    if (!prompt) return res.status(400).json({ success: false, error: 'Payload missing' });

    // --- إخفاء الهوية بالكامل هنا ---
    // نحن نحدد الموديل والرابط هنا في السيرفر، المستخدم لا يرى شيئاً
    const workerUrl = 'https://lxd.morttzia-me-3600.workers.dev';
    
    const aiRes = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model: "@cf/openai/gpt-oss-120b", // الموديل ثابت هنا ولا يراه المستخدم
        input: prompt,
        effort: "medium"
      })
    });

    const aiData = await aiRes.json();

    // فحص النجاح وإخفاء أخطاء كلاود فلير التقنية
    if (!aiRes.ok) {
      return res.status(502).json({ 
        success: false, 
        error: 'LXD Engine: Resource currently unavailable' // رسالة عامة لإخفاء التفاصيل
      });
    }

    let finalResult = '';
    if (aiData.output && Array.isArray(aiData.output)) {
      const msg = aiData.output.find(o => o.type === 'message');
      if (msg && msg.content && msg.content[0]) finalResult = msg.content[0].text;
    }
    if (!finalResult) {
      finalResult = aiData.result?.response || aiData.response || aiData.result || "No data.";
    }

    await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });

    return res.status(200).json({ 
      success: true, 
      result: finalResult 
    });

  } catch (error) {
    // في حال حدوث أي خطأ برمج، نعرض رسالة مشفرة
    return res.status(500).json({ success: false, error: 'LXD Node Error: Request could not be processed' });
  }
}
