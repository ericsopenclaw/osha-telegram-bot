/**
 * 職安自動檢查與法規顧問 LINE Bot - Cloudflare Worker
 * 使用 MiniMax API 進行文字問答與圖片辨識
 */

interface Env {
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_CHANNEL_SECRET: string;
  MINIMAX_API_KEY: string;
  MINIMAX_API_BASE: string;
  GOOGLE_DOCS_DOCUMENT_ID: string;
  WEBHOOK_SECRET: string;
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

// ============ LINE API ============
async function replyToLINE(replyToken: string, messages: any[], env: Env): Promise<void> {
  const url = "https://api.line.me/v2/bot/message/reply";
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LINE API error: ${response.status} - ${errorText}`);
  }
}

async function getLINEFileContent(messageId: string, env: Env): Promise<ArrayBuffer> {
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
  });

  if (!response.ok) {
    throw new Error(`LINE file fetch error: ${response.status}`);
  }

  return response.arrayBuffer();
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
          "Access-Control-Allow-Headers": "Content-Type, x-line-signature, x-line-webhook-secret",
        },
      });
    }

    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    try {
      const signature = request.headers.get("x-line-signature");
      const body = await request.text();
      const events: any[] = JSON.parse(body).events || [];
      
      for (const event of events) {
        if (event.type === "message" && event.message && event.replyToken) {
          const messageType = event.message.type;
          const replyToken = event.replyToken;
          
          const knowledgeBase = await fetchGoogleDocsContent(env);
          
          // 處理圖片訊息
          if (messageType === "image") {
            try {
              const messageId = event.message.id;
              const imageBuffer = await getLINEFileContent(messageId, env);
              const base64 = Buffer.from(imageBuffer).toString("base64");
              
              const result = await callMiniMaxVision(
                base64,
                "請詳細分析這張工地照片是否符合職安法規要求。",
                knowledgeBase,
                env
              );
              
              await replyToLINE(replyToken, [{ type: "text", text: result }], env);
            } catch (error) {
              console.error("Image processing error:", error);
              await replyToLINE(replyToken, [{ type: "text", text: "⚠️ 圖片處理失敗，請稍後再試。" }], env);
            }
          }
          // 處理文字訊息
          else if (messageType === "text") {
            const text = event.message.text?.trim() || "";
            
            if (!text || text === "?" || text === "help") {
              const welcomeMsg = `🏭 <b>職安自動檢查與法規顧問</b>

歡迎使用職安小幫手！

📝 <b>使用方式：</b>
• 直接輸入職安相關問題，我會為您查詢法規
• 上傳工地照片，我會自動檢查是否有違規

⚠️ 若規範未明確記載，請通報職安室確認。`;

              await replyToLINE(replyToken, [{ type: "text", text: welcomeMsg }], env);
              continue;
            }
            
            try {
              const result = await callMiniMaxText(text, knowledgeBase, env);
              await replyToLINE(replyToken, [{ type: "text", text: result }], env);
            } catch (error) {
              console.error("Text processing error:", error);
              await replyToLINE(replyToken, [{ type: "text", text: "⚠️ 系統忙碌中，請稍後再試。" }], env);
            }
          }
        }
      }

    } catch (error) {
      console.error("Webhook error:", error);
    }

    return new Response("OK", { status: 200 });
  },
};
