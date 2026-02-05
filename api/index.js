export default async function handler(req, res) {
    const userApiKey = req.headers['authorization'];
    const AUTHORIZED_KEYS = ["LXD_USER_001", "LXD_USER_002"];

    if (!userApiKey || !AUTHORIZED_KEYS.includes(userApiKey.replace('Bearer ', ''))) {
        return res.status(401).json({ error: "Access Denied: Invalid API Key" });
    }

    const { prompt, reasoning_effort = "medium" } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: "Missing 'prompt' field in request body" });
    }

    try {
        const workerUrl = 'https://lxd.morttzia-me-3600.workers.dev/';
        
        const aiResponse = await fetch(workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "@cf/openai/gpt-oss-120b",
                input: prompt,
                reasoning: { 
                    effort: reasoning_effort
                }
            })
        });

        const data = await aiResponse.json();

        return res.status(200).json({
            success: true,
            model_info: "LXD-Reasoning-v1",
            result: data.result || data
        });

    } catch (error) {
        return res.status(500).json({ error: "Internal Server Error" });
    }
}
