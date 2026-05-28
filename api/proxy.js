export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { targetUrl, method, headers, body } = req.body;

    if (!targetUrl) {
      return res.status(400).json({ error: 'Missing targetUrl' });
    }

    const response = await fetch(targetUrl, {
      method: method || 'POST',
      headers: headers || {},
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });

    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.status(response.status).json(data);
    } else {
      const text = await response.text();
      return res.status(response.status).send(text);
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
