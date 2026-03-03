// api/translate.js

const crypto = require('crypto');

module.exports = async (req, res) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(200).end();
  }

  // 只允许 GET
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
    
    // 修正：Nonce 必须是整数（腾讯要求 int 类型）
    // 生成 10 位随机正整数（1000000000 ~ 9999999999）
    const nonce = Math.floor(1000000000 + Math.random() * 9000000000);

    console.log('Generated Nonce (int):', nonce);  // 日志确认是数字

    const params = {
      Action: 'TextTranslate',
      Version: '2018-03-21',
      Region: 'ap-guangzhou',
      SecretId: secretId,
      Timestamp: timestamp,
      Nonce: nonce,                // 这里是 number 类型
      Source: 'en',
      Target: 'zh',
      ProjectId: 0,
      SourceText: text.trim()
    };

    // 排序 key（用于签名）
    const sortedKeys = Object.keys(params).sort((a, b) => a.localeCompare(b));

    // canonicalQueryString（用于签名）
    const canonicalQuery = sortedKeys
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');

    // stringToSign（严格四行，最后空行）
    const stringToSign = `GET
tmt.tencentcloudapi.com
/?${canonicalQuery}

`;

    console.log('stringToSign:', stringToSign);  // 调试用

    // 计算 HMAC-SHA1 签名
    const hmac = crypto.createHmac('sha1', secretKey + '&');
    hmac.update(stringToSign);
    const signature = hmac.digest('base64');

    console.log('Generated Signature:', signature);

    // 加到 params
    params.Signature = signature;

    // 构建 URL（包含 Signature）
    const apiUrl = new URL('https://tmt.tencentcloudapi.com/');
    sortedKeys.forEach(key => {
      apiUrl.searchParams.append(key, params[key]);
    });
    apiUrl.searchParams.append('Signature', signature);

    console.log('Final request URL:', apiUrl.toString().substring(0, 400) + '...');

    const response = await fetch(apiUrl.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Tencent HTTP error:', response.status, errorText);
      throw new Error(`Tencent returned ${response.status}: ${errorText}`);
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
