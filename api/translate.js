// api/translate.js
const crypto = require('crypto');

module.exports = async (req, res) => {
  // 设置 CORS 跨域头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { text } = req.query;
  if (!text) {
    return res.status(400).json({ error: 'Missing text parameter' });
  }

  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;

  if (!secretId || !secretKey) {
    console.error('Missing Tencent credentials in environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = Math.floor(Math.random() * 1000000000);

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
      SourceText: text
    };

    // 1. 签名步骤：参数排序后直接拼接，【禁止进行 URL 编码】
    const signQuery = Object.keys(params)
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');

    // 2. 拼接签名原文字符串：不能有换行符，且 URI 是 /
    const stringToSign = `GETtmt.tencentcloudapi.com/?${signQuery}`;

    // 3. HMAC-SHA1 加密：直接使用 secretKey，不需要加上 '&'
    const signature = crypto
      .createHmac('sha1', secretKey)
      .update(stringToSign)
      .digest('base64');

    // 将计算出的签名加入参数对象
    params.Signature = signature;

    // 4. 发起真实请求：此时必须用 URLSearchParams 将所有参数和签名进行 URL 编码
    const query = new URLSearchParams(params).toString();
    const url = `https://tmt.tencentcloudapi.com/?${query}`;

    const response = await fetch(url);
    const data = await response.json();

    // 检查腾讯云返回体内部的报错
    if (data.Response && data.Response.Error) {
      return res.status(400).json({ error: 'Translation failed', tencentError: data.Response.Error });
    }

    if (data.Response && data.Response.TargetText) {
      return res.status(200).json({ translation: data.Response.TargetText });
    } else {
      return res.status(500).json({ error: 'Unknown response format', details: data });
    }

  } catch (error) {
    console.error('Translation API error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};
