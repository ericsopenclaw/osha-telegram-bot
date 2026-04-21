# 🏭 職安自動檢查與法規顧問 LINE Bot

基於 LINE Messaging API + MiniMax AI 的職安小幫手，專門幫工地人員解答職安法規問題與自動檢查工地照片。

## 功能

- 📝 **文字問答**：輸入職安相關問題，即時查詢法規回答
- 📸 **圖片辨識**：上傳工地照片，AI 自動檢查是否有違規
- 📖 **知識庫**：串接 Google 文件職安規範

## 架構

```
LINE 用戶 → LINE Platform → Webhook → Cloudflare Worker
                                            ↓
                                      MiniMax API
                                            ↓
                                      Google Docs
                                            ↓
                                      回覆 LINE
```

## 環境變數

部署前需設定以下 Cloudflare Secrets：

| Secret | 說明 |
|--------|------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developer Console 取得的 Access Token |
| `LINE_CHANNEL_SECRET` | LINE Developer Console 取得的 Channel Secret |
| `MINIMAX_API_KEY` | MiniMax API Key |
| `MINIMAX_API_BASE` | MiniMax API 端點（預設：`https://api.minimax.chat`）|
| `GOOGLE_DOCS_DOCUMENT_ID` | Google 文件 ID |
| `WEBHOOK_SECRET` | Webhook 驗證密鑰 |

## 部署

```bash
# 1. 安裝 wrangler
npm install -g wrangler

# 2. 登入 Cloudflare
wrangler login

# 3. 設定環境變數
wrangler secret put LINE_CHANNEL_ACCESS_TOKEN
wrangler secret put LINE_CHANNEL_SECRET
wrangler secret put MINIMAX_API_KEY
wrangler secret put WEBHOOK_SECRET

# 4. 部署
npm run deploy
```

## LINE Webhook 設定

在 LINE Developer Console 設定 Webhook URL：
```
https://your-worker.workers.dev/webhook
```

## 授權

MIT License
