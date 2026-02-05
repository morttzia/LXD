import admin from 'firebase-admin';

function getFirestoreDB() {
  if (admin.apps.length > 0) return admin.firestore();
  const rawData = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!rawData) return null;
  try {
    let cleanJson = rawData.trim();
    if (cleanJson.startsWith('"') && cleanJson.endsWith('"')) cleanJson = cleanJson.slice(1, -1);
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
  // إعدادات الـ Headers لضمان البث الفوري ومنع التخزين المؤقت
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // تعطيل التخزين المؤقت في Vercel

  if (req.method === 'OPTIONS') return res.status(200).end();

  // إرسال نبضة فورية (Heartbeat) لمنع انقطاع الاتصال في أول 3 ثوانٍ
  res.write(': keep-alive\n\n'); 

  const db = getFirestoreDB();
  if (!db) {
    res.write(`data: ${JSON.stringify({ error: 'Database Error' })}\n\n`);
    return res.end();
  }

  try {
    const authHeader = req.headers['authorization'];
    const userKey = authHeader ? authHeader.replace('Bearer ', '') : null;
    const snapshot = await db.collection('api_keys').where('key', '==', userKey).limit(1).get();
    
    if (snapshot.empty) {
      res.write(`data: ${JSON.stringify({ error: 'Invalid API Key' })}\n\n`);
      return res.end();
    }

    const { prompt, messages, stream, effort } = req.body;
    let finalInput = prompt || (messages && messages.map(m => m.content).join('\n'));

    const workerUrl = 'https://lxd.morttzia-me-3600.workers.dev';

    // طلب البث من Cloudflare
    const aiRes = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model: "@cf/openai/gpt-oss-120b",
        input: finalInput,
        stream: true,
        reasoning: { effort: effort || "medium" }
      })
    });

    if (!aiRes.ok) throw new Error('AI Engine Timeout');

    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      // تحويل الرد إلى صيغة OpenAI SSE
      const sseData = {
        choices: [{ delta: { content: chunk }, index: 0 }]
      };
      res.write(`data: ${JSON.stringify(sseData)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    const keyDoc = snapshot.docs[0];
    await keyDoc.ref.update({ calls: (keyDoc.data().calls || 0) + 1 });

  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
  } finally {
    res.end();
  }
}
