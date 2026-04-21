/**
 * 職安自動檢查與法規顧問 Telegram Bot - Cloudflare Worker
 * 使用 MiniMax API 進行文字問答與圖片辨識
 */

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  MINIMAX_API_KEY: string;
  MINIMAX_API_BASE: string;
  GOOGLE_DOCS_DOCUMENT_ID: string;
  OSHA_KV: KVNamespace;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; first_name: string };
    chat: { id: number; type: string };
    text?: string;
    photo?: { file_id: string; width: number; height: number }[];
    date: number;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message: { chat: { id: number }; text: string };
    data: string;
  };
}

// ============ MiniMax API ============
async function callMiniMaxText(prompt: string, context: string, env: Env): Promise<string> {
  const url = `${env.MINIMAX_API_BASE}/v1/text/chatcompletion_v2`;
  
  const systemPrompt = `你是「職安自動檢查與法規顧問」，專門幫助工地現場人員解決職業安全與衛生法規問題。

回答風格：
- 【結論】：肯定/否定短句（10字內）
- 重點說明（30字內）
- 📖 出處：規則編號
- 若查無：⚠️ 規範未明，請通報職安室

以下是職安法規知識庫內容，請據此回答：
${context}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.MINIMAX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "MiniMax-Text-01",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MiniMax API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || "抱歉，系統暫時無法處理您的請求。";
}

async function callMiniMaxVision(imageBase64: string, question: string, context: string, env: Env): Promise<string> {
  const url = `${env.MINIMAX_API_BASE}/v1/vision/chatcompletion_v2`;

  const systemPrompt = `你是「職安自動檢查與法規顧問」，專門分析工地照片並找出潛在的職業安全與衛生違規問題。

回答風格：
- 若發現缺失：🚨【發現缺失】/ 違規條文 / 現場狀況 / 改善建議
- 若無明顯缺失：✅ 照片中未發現明顯工安缺失，辛苦了。

以下是職安法規知識庫內容：
${context}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.MINIMAX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "MiniMax-VL-01",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
            },
            {
              type: "text",
              text: `請分析這張工地照片是否違反職安法規。${question}`
            }
          ]
        }
      ],
      temperature: 0.3,
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MiniMax Vision API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || "抱歉，無法分析這張照片。";
}

// ============ Google Docs API ============
async function fetchGoogleDocsContent(env: Env): Promise<string> {
  try {
    // 使用 Google Apps Script 樣式 endpoint 獲取文件內容
    // 或者使用 Google Docs API
    const docId = env.GOOGLE_DOCS_DOCUMENT_ID;
    
    // 嘗試通過 Google Docs API 獲取內容
    const url = `https://docs.googleapis.com/v1/documents/${docId}`;
    
    // 注意：實際部署需要設置 GOOGLE_SERVICE_ACCOUNT_KEY 或使用 OAuth
    // 這裡使用模擬的知識庫內容作為回退
    const mockContent = `
職安法規要點：

1. 營造工程安全設施標準
   - 作業平台高度超過2公尺應設置護欄
   - 吊運作業半徑下方禁止有人停留
   - 電焊作業應有接地裝置

2. 職業安全衛生法
   - 第6條：雇主應防止機械、器具等危害
   - 第7條：機械等設備應符合安全標準
   - 第20條：應對作業場所進行風險評估

3. 個人防護具
   - 安全帽：進入工地必須佩戴
   - 安全鞋：高處作業應穿著
   - 安全帶：高度2公尺以上作業必須使用

4. 施工架標準
   - 高度超過5公尺應採用左側標示
   - 垂直間隔每9公尺以內應設置水平護欄

5. 消防設施
   - 施工現場應設置滅火器
   - 每多少平方公尺應設置一具
    `;
    
    return mockContent;
  } catch (error) {
    console.error("Error fetching Google Docs:", error);
    return "⚠️ 無法取得職安法規資料庫，請稍後再試。";
  }
}

// ============ Telegram API ============
async function sendTelegramMessage(chatId: number, text: string, env: Env): Promise<void> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });
}

async function sendTelegramPhoto(chatId: number, photoUrl: string, caption: string, env: Env): Promise<void> {
  // 先獲取 photo file_id
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendPhoto`;
  
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: "HTML",
    }),
  });
}

async function answerCallbackQuery(callbackQueryId: string, text: string, env: Env): Promise<void> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
  
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
    }),
  });
}

// ============ 主 Handler ============
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // 只接受 POST 請求
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    try {
      const update: TelegramUpdate = await request.json();
      
      // 處理訊息
      if (update.message) {
        const chatId = update.message.chat.id;
        const text = update.message.text;
        const photo = update.message.photo;

        // 獲取知識庫內容
        const knowledgeBase = await fetchGoogleDocsContent(env);

        // 有照片 → 圖片辨識
        if (photo && photo.length > 0) {
          // 獲取最大尺寸照片
          const photoId = photo[photo.length - 1].file_id;
          
          // 獲取檔案 URL
          const fileResponse = await fetch(
            `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${photoId}`
          );
          const fileData = await fileResponse.json() as any;
          
          if (fileData.ok) {
            const filePath = fileData.result.file_path;
            const fileUrl = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
            
            // 下載圖片並轉為 base64
            const imageResponse = await fetch(fileUrl);
            const imageBuffer = await imageResponse.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
            
            // 叫用 MiniMax Vision
            const result = await callMiniMaxVision(base64, "請詳細分析這張工地照片是否符合職安法規要求。", knowledgeBase, env);
            
            await sendTelegramMessage(chatId, result, env);
          }
        }
        // 純文字 → 文字問答
        else if (text) {
          // 去掉 / 指令
          const cleanText = text.replace(/^\/\w+\s*/, "").trim();
          
          if (!cleanText) {
            await sendTelegramMessage(
              chatId,
              "🏭 <b>職安自動檢查與法規顧問</b>\n\n請輸入您的職安相關問題，我會為您查詢法規並提供建議。\n\n例如：「高空作業需要什麼防護具？」",
              env
            );
            return new Response("OK", { status: 200 });
          }

          const result = await callMiniMaxText(cleanText, knowledgeBase, env);
          await sendTelegramMessage(chatId, result, env);
        }
      }
      // 處理 callback query
      else if (update.callback_query) {
        const callbackQueryId = update.callback_query.id;
        const data = update.callback_query.data;
        
        await answerCallbackQuery(callbackQueryId, `您選擇了: ${data}`, env);
      }

    } catch (error) {
      console.error("Error processing update:", error);
    }

    return new Response("OK", { status: 200 });
  },

  // Webhook endpoint for Telegram
  async webhook(request: Request, env: Env): Promise<Response> {
    return this.fetch(request, env, {} as ExecutionContext);
  }
};

// 聲明執行上下文類型
interface ExecutionContext {
  waitUntil(promise: Promise<void>): void;
  passThroughOnException(): void;
}