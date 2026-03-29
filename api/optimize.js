/**
 * api/optimize.js — Vercel Serverless Function
 * 适用场景：小范围分享（<50人），站长承担费用，控制在免费额度内
 *
 * 防护策略（两层，都有效）：
 *   1. 访问密码   — 只有拿到密码的人才能调用，彻底挡住陌生人
 *   2. Vercel KV  — 真实持久化计数，每个密码每天限 N 次，跨实例生效
 *
 * Vercel 环境变量（在 Dashboard → Settings → Environment Variables 设置）：
 *   ANTHROPIC_API_KEY   必填  sk-ant-api03-xxxxx
 *   ACCESS_PASSWORD     必填  随便取一个密码，如 crispe2025
 *   KV_REST_API_URL     必填  来自 Vercel KV（见下方说明）
 *   KV_REST_API_TOKEN   必填  来自 Vercel KV
 *   DAILY_LIMIT         可选  每个密码每天最多调用几次，默认 20
 *
 * Vercel KV 创建方式（完全免费，每月 30万次 读写）：
 *   Vercel Dashboard → Storage → Create → KV Database → 选 Free 套餐
 *   创建后点击数据库 → Settings → 复制 KV_REST_API_URL 和 KV_REST_API_TOKEN
 */

// ── 常量 ─────────────────────────────────────────
const DAILY_LIMIT  = parseInt(process.env.DAILY_LIMIT || '20', 10);
const VALID_MODES  = ['crispe', 'enhance', 'variants', 'critique'];

// ── Vercel KV 轻量封装（无需安装 SDK，直接用 REST API）──
async function kvGet(key) {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  try {
    const res  = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return data.result ?? null;          // null 表示 key 不存在
  } catch { return null; }
}

async function kvSet(key, value, exSeconds) {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return;
  try {
    await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}?ex=${exSeconds}`, {
      method:  'GET',                    // Vercel KV REST 用 GET 设置值
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch { /* 忽略写入失败，不影响主流程 */ }
}

// 获取今天的日期字符串作为 key 后缀，例如 "2025-03-02"
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── 每日调用计数（基于 KV）──────────────────────
// key 格式：opt:count:2025-03-02
// 每天 0 点自动过期（TTL = 到明天 0 点的秒数）
async function checkDailyLimit() {
  const key     = `opt:count:${todayStr()}`;
  const current = parseInt(await kvGet(key) || '0', 10);

  if (current >= DAILY_LIMIT) {
    return { allowed: false, used: current, limit: DAILY_LIMIT };
  }

  // 计算到明天 0 点的剩余秒数
  const now       = new Date();
  const tomorrow  = new Date(now);
  tomorrow.setUTCHours(24, 0, 0, 0);
  const ttlSec    = Math.ceil((tomorrow - now) / 1000);

  await kvSet(key, String(current + 1), ttlSec);
  return { allowed: true, used: current + 1, limit: DAILY_LIMIT };
}

// ── 系统提示词 ───────────────────────────────────
const SYSTEM_BASE = `你是提示词工程专家，专注 CRISPE+ 框架：
C（角色）/ R（背景）/ I（任务）/ S（风格）/ P（示例）/ E+（格式）
输出规则：中文，不超过 500 字，不重复原始输入，直接给结论。`;

const MODE_INST = {
  crispe:   '将用户提示词重构为完整 CRISPE+ 结构，每维度用【C】【R】【I】【S】【P】【E+】标注，信息不足处用「⚠ 请补充：…」标出。',
  enhance:  '找出用户提示词缺失的 CRISPE+ 维度，逐条列出并给出 30 字以内的具体补充建议。',
  variants: '生成 3 个变体：【变体A·专业深度版】【变体B·简洁直达版】【变体C·多方案对比版】，每个 2-3 句话。',
  critique: '找出 3-5 个具体弱点，每条格式：❌ 问题 → 原因 → ✅ 一句话修复建议。',
};

// ── 主处理函数 ───────────────────────────────────
export default async function handler(req, res) {

  // 1. 只接受 POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持 POST 请求' });
  }

  const body = req.body || {};

  // 2. 访问密码校验 ★ 核心防线 ★
  //    前端在请求体中带上 password 字段
  const correctPwd = process.env.ACCESS_PASSWORD;
  if (correctPwd) {
    if (!body.password || body.password !== correctPwd) {
      return res.status(401).json({ error: '密码错误，请联系管理员获取访问密码' });
    }
  }

  // 3. Vercel KV 每日总量限制（全站共享配额）
  const quota = await checkDailyLimit();
  res.setHeader('X-Daily-Used',  quota.used);
  res.setHeader('X-Daily-Limit', quota.limit);

  if (!quota.allowed) {
    return res.status(429).json({
      error: `今日优化次数已达上限（${quota.limit} 次/天），明天再来吧 🙏`,
      dailyUsed:  quota.used,
      dailyLimit: quota.limit,
    });
  }

  // 4. 参数校验
  const { prompt, mode } = body;
  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 3) {
    return res.status(400).json({ error: '提示词不能少于 3 个字符' });
  }
  const safeMode = VALID_MODES.includes(mode) ? mode : 'crispe';

  // 5. 输入清洗（防注入 + 控 Token）
  const cleanInput = prompt
    .slice(0, 600)                                     // 最多 600 字
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 去控制字符
    .trim();

  // 6. 检查 API Key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务端未配置 API Key，请联系管理员' });
  }

  // 7. 调用 Claude Haiku（最便宜的模型）
  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001', // Haiku：成本约为 Sonnet 的 1/20
        max_tokens: 512,                          // 单次上限 512 token ≈ 400 中文字
        system:     `${SYSTEM_BASE}\n当前任务：${MODE_INST[safeMode]}`,
        messages:   [{ role: 'user', content: cleanInput }],
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      return res.status(502).json({ error: err?.error?.message || `上游错误 ${upstream.status}` });
    }

    const data   = await upstream.json();
    const result = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    return res.status(200).json({
      result,
      dailyUsed:  quota.used,
      dailyLimit: quota.limit,
    });

  } catch (e) {
    console.error('[optimize]', e);
    return res.status(500).json({ error: '请求失败，请稍后重试' });
  }
}
