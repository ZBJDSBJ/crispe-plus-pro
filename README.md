# CRISPE+ Pro · 提示词工程手册

> 一站式 AI 提示词学习平台。六维框架 · 案例库 · 生成器 · Agent 技能 · 项目规范文件 · AI 优化器

---

## 📁 项目文件结构

```
crispe-plus-pro/
├── index.html          # 主页面（单文件，全部功能内置）
├── api/
│   └── optimize.js     # Vercel Serverless Function（AI 优化器后端）
├── vercel.json         # Vercel 部署配置
└── README.md           # 本文件
```

**上传 GitHub 时，这 4 个文件必须全部上传，缺一不可。**

---

## 🚀 部署指南（GitHub + Vercel）

### 第一步：上传到 GitHub

1. 登录 [github.com](https://github.com)
2. 右上角 **`+`** → **`New repository`**
3. 填写仓库名：`crispe-plus-pro`，选择 **Public**
4. **不要**勾选任何初始化选项，直接点 **`Create repository`**

**上传文件（注意：api 文件夹需要单独处理）**

**方法 A — 网页上传（推荐新手）**

Step 1：先上传根目录文件
- 进入仓库，点 **`Add file`** → **`Upload files`**
- 把 `index.html` / `vercel.json` / `README.md` 拖进上传区
- Commit message 写 `Initial commit`，点 **`Commit changes`**

Step 2：创建 api/optimize.js
- 回到仓库首页，点 **`Add file`** → **`Create new file`**
- 文件名输入框里输入 `api/optimize.js`（输入 `/` 会自动创建文件夹）
- 把本地 `api/optimize.js` 的全部内容粘贴进去
- 点 **`Commit changes`**

**方法 B — Git 命令行**

```bash
git clone https://github.com/你的用户名/crispe-plus-pro.git
# 把所有文件复制进去（保持 api/ 目录结构不变）
git add .
git commit -m "Initial commit"
git push
```

---

### 第二步：部署到 Vercel

1. 打开 [vercel.com](https://vercel.com)，点 **`Continue with GitHub`** 登录
2. 点 **`Add New`** → **`Project`**
3. 找到 `crispe-plus-pro` 仓库，点 **`Import`**
4. 配置页：
   - Framework Preset → **`Other`**
   - Root Directory → 保持默认 `./`
   - Build & Output Settings → **全部留空**
5. **先不要点 Deploy**，先看下面的环境变量配置

---

### 第三步：配置环境变量

在部署配置页，展开 **`Environment Variables`**，依次添加以下 4 个变量：

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic API Key，格式 `sk-ant-api03-...` |
| `ACCESS_PASSWORD` | ✅ | 自定义访问密码，分享给使用者，如 `crispe2025` |
| `KV_REST_API_URL` | ✅ | Vercel KV 数据库地址（见下方获取方式） |
| `KV_REST_API_TOKEN` | ✅ | Vercel KV 访问令牌（见下方获取方式） |
| `DAILY_LIMIT` | 可选 | 每天全站 AI 调用限额，默认 `20` |

**获取 Vercel KV（完全免费）：**

1. Vercel Dashboard → 左侧菜单 **`Storage`** → **`Create`**
2. 选 **`KV`** → 输入一个名字（如 `crispe-kv`）→ 选 **Free 套餐** → **`Create`**
3. 创建后点进去 → 选 **`.env.local`** 标签页
4. 找到并复制 `KV_REST_API_URL` 和 `KV_REST_API_TOKEN` 的值

**获取 Anthropic API Key：**

1. 打开 [console.anthropic.com](https://console.anthropic.com)
2. 左侧 **`API Keys`** → **`Create Key`**，填个名字
3. 复制 `sk-ant-api03-...` 开头的密钥（只显示一次，注意保存）

配置完成后点 **`Deploy`**，等待约 30 秒。

---

### 第四步：访问网站

部署成功后，Vercel 自动生成网址，格式为：

```
https://crispe-plus-pro-xxxx.vercel.app
```

点进去即可使用全部功能。

**AI 优化器使用：**
进入「AI 优化」模块 → 在密码框输入你设置的 `ACCESS_PASSWORD` → 即可调用 Claude 优化提示词

---

### 第五步：后续更新（全自动）

GitHub 上的文件一旦更新，Vercel 会在 30 秒内自动重新部署，网址不变。

```bash
# 本地修改后
git add .
git commit -m "描述改动"
git push
# Vercel 自动完成，无需任何操作
```

---

## 🌐 绑定自定义域名（可选）

1. Vercel 项目 → **`Settings`** → **`Domains`**
2. 输入你的域名
3. 按提示在域名服务商处添加 DNS 解析记录
4. 等待 5–30 分钟生效

---

## 📋 功能模块

| 编号 | 模块 | 说明 |
|------|------|------|
| 01 | 六维框架 | CRISPE+ 每个维度详解、作用与例句 |
| 02 | 案例库 | 9 个行业真实案例，完整 CRISPE+ 拆解 |
| 03 | 提示词生成器 | 填写维度自动生成，含完整度评分 |
| 04 | Agent 技能 | 9 个预置 Agent 模板，附 Cursor/CLAUDE.md 规范文件 |
| 05 | 项目规范文件 | Rules/Skills/Plans/Specs/Agent 五种文件类型说明与模板 |
| 06 | AI 优化器 | Claude Haiku 驱动，密码+每日限额双重保护 |
| 07 | 速查手册 | 提示词写作技巧速查卡片 |

---

## ⚠️ 注意事项

- AI 优化器需要能访问 Anthropic API 的网络环境（国内需代理）
- 字体使用 Google Fonts，国内访问可能需要代理
- 除 AI 优化器外，其余所有模块完全静态，离线可用
- Vercel 免费版每月 100GB 流量 + 100 小时函数时间，个人使用完全够

---

## 📄 License

本项目仅供学习和个人使用。CRISPE 框架原版由 Matt Nigh 提出。
