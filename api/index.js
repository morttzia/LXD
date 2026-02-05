// api/index.js
export default async function handler(req, res) {
    const userKey = req.headers['authorization']?.replace('Bearer ', '');
    // ... كود التحقق من المفتاح في Firestore ...

    const { prompt } = req.body;
    
    // تثبيت جهد التفكير على "high" لضمان أفضل جودة رد
    const reasoning_effort = "high"; // 

    try {
        const workerUrl = 'https://lxd.morttzia-me-3600.workers.dev/';
        const aiResponse = await fetch(workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "@cf/openai/gpt-oss-120b", // 
                input: prompt, // 
                reasoning: { 
                    effort: reasoning_effort // [cite: 19, 20, 35, 36]
                }
            })
        });

        const data = await aiResponse.json();
        return res.status(200).json({
            success: true,
            result: data.result || data
        });
    } catch (error) {
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
