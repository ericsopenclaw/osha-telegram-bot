# 職安自動檢查與法規顧問 Telegram Bot

使用 Cloudflare Worker + MiniMax API 打造的職安法規顧問機器人。

## 功能

- 📝 **文字問答**：回答職安相關法規問題
- 📸 **圖片辨識**：分析工地照片是否符合職安規範
- 📖 **法規資料庫**：串接 Google 文件作為知識庫

## 架構

```
Telegram 用戶 → Cloudflare Worker → MiniMax API → Telegram 回覆
                    ↓
              Google 文件知識庫
```

## 環境變數

| 變數 | 說明 |
|------|------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token |
| `MINIMAX_API_KEY` | MiniMax API Key |
| `MINIMAX_API_BASE` | MiniMax API 端點 |
| `GOOGLE_DOCS_DOCUMENT_ID` | Google 文件 ID |

## 部署

### Cloudflare Workers

```bash
# 安裝 wrangler
npm install -g wrangler

# 登入
wrangler login

# 部署
wrangler deploy
```

### 設定 Telegram Webhook

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://your-worker.workers.dev/webhook" \
  -d "secret_token=YOUR_SECRET"
```

## 開發

```bash
npm install
npm run dev
```

## Vercel 備援部署

詳見 `.github/workflows/deploy.yml`