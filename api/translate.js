// api/translate.js
const crypto = require('crypto');

module.exports = async (req, res) => {
  // 处理 CORS 预检请求 (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400'); // 缓存 24 小时
    return res.status(200).end();
  }

  // 只允许 GET 请求
  if (req.method !== 'GET') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { text } = req.query;

  if (!text || typeof text !== 'string' || text.trim() === '') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).json({ error: 'Missing or invalid "text" parameter' });
  }

  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;

  if (!secretId || !secretKey) {
    console.error('Missing Tencent Cloud credentials in environment variables');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ 
      error: 'Server configuration error',
      message: 'Tencent credentials not found'
    });
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.floor(Math.random() * 1000000000);

    // 参数（按腾讯要求）
    const params = {
      Action: 'TextTranslate',
      Version: '2018-03-21',
      Region: 'ap-guangzhou',
      SecretId: secretId,
      Timestamp: timestamp,
      Nonce: nonce,
      Source: 'en',
      Target: 'zh',
      ProjectId: 0,
      SourceText: text.trim()
    };

    // 1. 按字母顺序排序参数 key
    const sortedKeys = Object.keys(params).sort();

    // 2. 构建 canonicalQueryString（key=value&key=value...，value 已 encode）
    const queryParts = sortedKeys.map(key => 
      `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
    );
    const canonicalQuery = queryParts.join('&');

    // 3. 构建待签名字符串（腾讯标准格式）
    const stringToSign = `GET\ntmt.tencentcloudapi.com\n/?${canonicalQuery}\n`;

    // 4. HMAC-SHA1 签名（key 为 secretKey + '&'）
    const hmac = crypto.createHmac('sha1', secretKey + '&');
    hmac.update(stringToSign);
    const signature = hmac.digest('base64');

    // 5. 把签名加回 params
    params.Signature = signature;

    // 6. 使用现代 URL 对象构建最终请求 URL
    const apiUrl = new URL('https://tmt.tencentcloudapi.com/');
    sortedKeys.forEach(key => {
      apiUrl.searchParams.append(key, params[key]);
    });

    console.log('Requesting Tencent API:', apiUrl.toString().substring(0, 200) + '...'); // 日志截断，避免泄露完整签名

    const response = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Vercel-Serverless-Translate/1.0'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Tencent API HTTP error:', response.status, errorText);
      throw new Error(`Tencent API returned ${response.status}`);
    }

    const data = await response.json();

    if (data.Response && data.Response.TargetText) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({
        translated: data.Response.TargetText.trim()
      });
    } else {
      console.error('Tencent API error response:', JSON.stringify(data, null, 2));
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(500).json({
        error: 'Translation failed',
        tencentError: data.Response?.Error || 'Unknown error',
        details: data
      });
    }
  } catch (err) {
    console.error('translate.js error:', err.message, err.stack);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({
      error: 'Server error',
      message: err.message
    });
  }
};
