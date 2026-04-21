/**
 * 職安自動檢查與法規顧問 Telegram Bot - Cloudflare Worker
 * 使用 OpenAI API 進行文字問答與圖片辨識
 */

interface Env {
  TELEGRAM_BOT_TOKEN: string;
  OPENAI_API_KEY: string;
  GOOGLE_DOCS_DOCUMENT_ID: string;
  WEBHOOK_SECRET: string;
}

// ============ Telegram API ============
async function sendTelegramMessage(chatId: number, text: string, env: Env): Promise<void> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API error: ${response.status} - ${errorText}`);
  }
}

async function getTelegramFile(fileId: string, env: Env): Promise<string> {
  // 1. 取得檔案路徑
  const fileResponse = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`
  );
  const fileData = await fileResponse.json() as any;
  
  if (!fileData.ok) {
    throw new Error(`Telegram getFile error: ${fileData.description}`);
  }
  
  return fileData.result.file_path;
}

async function downloadTelegramFile(filePath: string, env: Env): Promise<ArrayBuffer> {
  const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Telegram file download error: ${response.status}`);
  }
  
  return response.arrayBuffer();
}

// ============ OpenAI API ============
async function callOpenAIText(prompt: string, context: string, env: Env): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";
  
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
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
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
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || "抱歉，系統暫時無法處理您的請求。";
}

async function callOpenAIVision(imageBase64: string, question: string, context: string, env: Env): Promise<string> {
  const url = "https://api.openai.com/v1/chat/completions";

  const systemPrompt = `你是「職安自動檢查與法規顧問」，專門分析工地照片並找出潛在的職業安全與衛生違規問題。

回答風格：
- 若發現缺失：🚨【發現缺失】/ 違規條文 / 現場狀況 / 改善建議
- 若無明顯缺失：✅ 照片中未發現明顯工安缺失，辛苦了。

以下是職安法規知識庫內容：
${context}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: systemPrompt + "\n\n" + `請分析這張工地照片是否違反職安法規。${question}`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 600,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Vision API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || "抱歉，無法分析這張照片。";
}

// ============ Google Docs (Mock) ============
async function fetchGoogleDocsContent(env: Env): Promise<string> {
  try {
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
    `;
    return mockContent;
  } catch (error) {
    console.error("Error fetching Google Docs:", error);
    return "⚠️ 無法取得職安法規資料庫，請稍後再試。";
  }
}

// ============ Main Handler ============
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    try {
      const update = await request.json() as any;
      
      // 處理訊息
      if (update.message) {
        const chatId = update.message.chat.id;
        const text = update.message.text;
        const photo = update.message.photo;
        const document = update.message.document;

        // 獲取知識庫內容
        const knowledgeBase = await fetchGoogleDocsContent(env);

        // 有照片 → 圖片辨識
        if (photo && photo.length > 0) {
          try {
            // 取得最大尺寸的照片
            const photoId = photo[photo.length - 1].file_id;
            const filePath = await getTelegramFile(photoId, env);
            const imageBuffer = await downloadTelegramFile(filePath, env);
            const base64 = Buffer.from(imageBuffer).toString("base64");
            
            const result = await callOpenAIVision(
              base64,
              "請詳細分析這張工地照片是否符合職安法規要求。",
              knowledgeBase,
              env
            );
            
            await sendTelegramMessage(chatId, result, env);
          } catch (error) {
            console.error("Image processing error:", error);
            await sendTelegramMessage(chatId, "⚠️ 圖片處理失敗，請稍後再試。", env);
          }
        }
        // 有文件 → 當作圖片處理
        else if (document) {
          try {
            const filePath = await getTelegramFile(document.file_id, env);
            const imageBuffer = await downloadTelegramFile(filePath, env);
            const base64 = Buffer.from(imageBuffer).toString("base64");
            
            const result = await callOpenAIVision(
              base64,
              "請詳細分析這張圖片是否符合職安法規要求。",
              knowledgeBase,
              env
            );
            
            await sendTelegramMessage(chatId, result, env);
          } catch (error) {
            console.error("Document processing error:", error);
            await sendTelegramMessage(chatId, "⚠️ 文件處理失敗，請稍後再試。", env);
          }
        }
        // 純文字 → 文字問答
        else if (text) {
          const cleanText = text.replace(/^\/\w+\s*/, "").trim();
          
          if (!cleanText || cleanText === "?" || cleanText === "help" || cleanText === "/start") {
            const welcomeMsg = `🏭 <b>職安自動檢查與法規顧問</b>

歡迎使用職安小幫手！

📝 <b>使用方式：</b>
• 直接輸入職安相關問題，我會為您查詢法規
• 上傳工地照片，我會自動檢查是否有違規

⚠️ 若規範未明確記載，請通報職安室確認。`;

            await sendTelegramMessage(chatId, welcomeMsg, env);
            return new Response("OK", { status: 200 });
          }

          try {
            const result = await callOpenAIText(cleanText, knowledgeBase, env);
            await sendTelegramMessage(chatId, result, env);
          } catch (error) {
            console.error("Text processing error:", error);
            await sendTelegramMessage(chatId, "⚠️ 系統忙碌中，請稍後再試。", env);
          }
        }
      }

    } catch (error) {
      console.error("Webhook error:", error);
    }

    return new Response("OK", { status: 200 });
  },
};
