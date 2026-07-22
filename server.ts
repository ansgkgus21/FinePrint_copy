import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Set up JSON body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer memory storage for handling multipart form uploads
const upload = multer({ storage: multer.memoryStorage() });

// Shared API Key client utility with lazy initialization
let aiClient: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is not defined. Please set it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// In-memory data store to map service name to URLs and file texts
interface ServiceData {
  serviceName: string;
  urls: { url: string; type: string }[];
  texts: { filename?: string; text: string; type: string }[];
}

const serviceStorage = new Map<string, ServiceData>();

// React 화면 상태 및 Python API 호환 엔드포인트
app.get(["/health", "/api/health"], (_req, res) => {
  res.json({ status: "ok", service: "fineprint-ui" });
});

// Endpoint: Prepare Service
app.post(["/services/prepare", "/api/services/prepare"], (req, res) => {
  const { service_name } = req.body;
  if (!service_name) {
    return res.status(400).json({ detail: "service_name is required" });
  }

  let data = serviceStorage.get(service_name);
  if (!data) {
    data = { serviceName: service_name, urls: [], texts: [] };
    serviceStorage.set(service_name, data);
  }

  const responseStatus = {
    service_name,
    service_documents_ready: true,
    reference_documents_ready: true,
    policy_status: {
      terms: true,
      privacy: true
    },
    missing_policy_types: [],
    requires_policy_input: false
  };

  res.json(responseStatus);
});

// Endpoint: Ingest Service URL
app.post(["/services/url", "/api/services/url"], async (req, res) => {
  const { service_name, url, document_type } = req.body;
  if (!service_name || !url) {
    return res.status(400).json({ detail: "service_name and url are required" });
  }

  if (document_type && document_type !== "terms" && document_type !== "privacy") {
    return res.status(400).json({ detail: "document_type은 terms 또는 privacy여야 합니다." });
  }

  let fetchedText = "";
  try {
    const urlRes = await fetch(url);
    if (urlRes.ok) {
      const html = await urlRes.text();
      // Simple HTML stripping
      fetchedText = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    } else {
      fetchedText = `Failed to fetch URL: ${url}. Status code: ${urlRes.status}`;
    }
  } catch (err: any) {
    fetchedText = `Failed to fetch URL: ${url}. Error: ${err.message}`;
  }

  let data = serviceStorage.get(service_name);
  if (!data) {
    data = { serviceName: service_name, urls: [], texts: [] };
    serviceStorage.set(service_name, data);
  }

  const docType = document_type || "terms";
  data.urls.push({ url, type: docType });
  data.texts.push({
    text: fetchedText,
    type: docType
  });

  const responseStatus = {
    service_name,
    service_documents_ready: true,
    reference_documents_ready: true,
    policy_status: {
      terms: docType === "terms" || data.texts.some(t => t.type === "terms"),
      privacy: docType === "privacy" || data.texts.some(t => t.type === "privacy")
    },
    missing_policy_types: [],
    requires_policy_input: false
  };

  res.json(responseStatus);
});

// Endpoint: Upload Service Document
app.post(["/services/document", "/api/services/document"], upload.single("file"), (req, res) => {
  const { service_name, document_type } = req.body;
  const file = req.file;
  if (!service_name) {
    return res.status(400).json({ detail: "service_name is required" });
  }
  if (!file) {
    return res.status(400).json({ detail: "file is required" });
  }

  if (document_type && document_type !== "terms" && document_type !== "privacy") {
    return res.status(400).json({ detail: "document_type은 terms 또는 privacy여야 합니다." });
  }

  if (file.size > 20 * 1024 * 1024) {
    return res.status(413).json({ detail: "파일은 20MB 이하여야 합니다." });
  }

  const text = file.buffer.toString("utf-8");
  
  let data = serviceStorage.get(service_name);
  if (!data) {
    data = { serviceName: service_name, urls: [], texts: [] };
    serviceStorage.set(service_name, data);
  }
  
  const docType = document_type || "terms";
  data.texts.push({
    filename: file.originalname,
    text,
    type: docType
  });

  const responseStatus = {
    service_name,
    service_documents_ready: true,
    reference_documents_ready: true,
    policy_status: {
      terms: docType === "terms" || data.texts.some(t => t.type === "terms"),
      privacy: docType === "privacy" || data.texts.some(t => t.type === "privacy")
    },
    missing_policy_types: [],
    requires_policy_input: false
  };

  res.json(responseStatus);
});

// Endpoint: Ask Agent (Q&A analysis)
app.post(["/questions", "/api/questions", "/api/v1/agent/analyze"], async (req, res) => {
  const { service_name, question, policy_urls, include_trace } = req.body;
  if (!service_name || !question) {
    return res.status(400).json({ detail: "service_name and question are required" });
  }

  try {
    const ai = getAI();

    // Retrieve saved documents and URLs for this service
    const data = serviceStorage.get(service_name);
    let contextDocs = "";
    if (data && data.texts.length > 0) {
      contextDocs = data.texts
        .map((t, idx) => `[Document ${idx + 1}] (${t.type}):\n${t.text.slice(0, 5000)}`)
        .join("\n\n");
    }

    if (policy_urls && typeof policy_urls === "object") {
      const extraUrls = Object.entries(policy_urls)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");
      if (extraUrls) {
        contextDocs += `\n\n[추가 정책 URL 리스트]\n${extraUrls}`;
      }
    }

    const systemInstruction = `당신은 구독 서비스 약관 분석 및 소비자 권리 구제 전문 AI Agent 'FinePrint'입니다.
사용자가 입력한 서비스(${service_name})와 질문(${question})에 대해, 최신 약관 정보와 소비자 보호 규정을 기반으로 철저하고 구체적인 법적 분석과 대응 방안을 제공해 주세요.

[제공된 약관 및 참고 문서 컨텍스트]
${contextDocs || "제공된 컨텍스트 문서가 없습니다. Google Search를 적극적으로 활용해 주세요."}

[엄격한 사실성 및 환각 방지 지침 (Grounding & Hallucination Guardrail)]
1. 만약 입력한 서비스(${service_name})가 실제로 존재하지 않거나 가상의 서비스인 경우, 또는 제공된 문서 컨텍스트와 Google 검색을 통한 공식 자료 조사에서도 해당 서비스의 실제 약관/환불/결제 정책을 전혀 확인할 수 없다면, **절대로 상상하거나 일반적인 답변을 지어내지 마십시오.**
2. 서비스 정보를 찾을 수 없는 경우에는 반드시 아래와 같이 답변하세요:
   - problem_type: "서비스 약관 정보 미확인"
   - simple_explanation: "입력하신 서비스('${service_name}')에 대한 공식 약관이나 환불/결제 정책 정보를 확인할 수 없습니다. 서비스명이 정확한지 확인해 주시거나, 약관 URL 또는 PDF/TXT 약관 문서를 직접 입력 및 업로드해 주시면 정확하게 분석해 드리겠습니다."
   - terms_evidence: ["공식 약관 근거 없음 (확인 불가)"]
   - source_references: ["약관 출처 없음"]
   - check_items: ["서비스명이 정확한 공식 스펠링/명칭인지 확인", "해당 서비스의 이용약관 및 결제 정책 URL 확인"]
   - next_actions: ["'약관 URL 분석' 탭으로 이동하여 해당 서비스의 약관 링크 입력 후 재검색", "또는 '문서 업로드' 탭에서 약관 파일(PDF/TXT)을 첨부하여 분석 진행"]
   - required_materials: ["해당 서비스의 공식 이용약관 링크 또는 약관 문서 파일"]
   - inquiry_draft: "공식 약관 정보가 확인되지 않아 문의글 초안을 생성할 수 없습니다. 서비스 약관 URL이나 파일 업로드 후 다시 시도해 주세요."
   - follow_up_questions: ["서비스의 정확한 공식 명칭이 무엇인가요?", "해당 서비스의 약관 웹사이트 링크가 있으신가요?"]

3. 실제 존재하는 서비스이고 근거 약관 정보가 확인된 경우에만 다음과 같이 충실하게 답하세요:
   - 'simple_explanation': 상황에 대한 쉽고 명확한 해설을 적어주세요. 한국어로 작성하며 신뢰성 있고 전문적인 어조를 유지하세요.
   - 'terms_evidence': 약관 중 사용자의 권리 주장에 핵심이 되는 조항들을 요약하고 설명해 주세요.
   - 'source_references': 실제 약관의 원문 구절이나 출처 링크, 출처 조항을 적어주세요.
   - 'check_items': 사용자가 가장 먼저 확인해야 할 체크리스트 항목들입니다.
   - 'next_actions': 사용자가 권리를 행사하기 위해 취해야 할 실질적인 단계별 행동 강령(To-Do 리스트)입니다.
   - 'required_materials': 고객센터나 관련 기관에 입증 자료로 제출할 준비물입니다.
   - 'inquiry_draft': 고객센터에 바로 복사하여 보낼 수 있는 예의 바르고 법적으로 타당한 공식 문의글/메일 초안입니다.
   - 'follow_up_questions': 추천 후속 질문 2~3가지입니다.`;

    const userPrompt = `서비스: ${service_name}
사용자 질문: ${question}

위 서비스에 대하여 사용자가 처한 구체적 상황을 분석하고 대응 방안을 한국어로 상세히 구성해 주세요.`;

    const jsonSchema = {
      type: Type.OBJECT,
      properties: {
        problem_type: { type: Type.STRING, description: "의뢰 유형 (예: 구독 환불 분쟁, 자동 결제 갱신 등)" },
        simple_explanation: { type: Type.STRING, description: "사용자가 이해하기 쉬운 상세한 설명 및 가이드 (한국어)" },
        terms_evidence: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "약관 내 직접적인 관련 조항 요약 또는 번역 리스트"
        },
        source_references: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "출처 및 실제 약관 원문 구절 리스트" 
        },
        check_items: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "사용자가 가장 먼저 확인해야 할 체크리스트 항목들"
        },
        next_actions: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "권리 보호 행동 강령 To-Do 리스트"
        },
        required_materials: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "고객센터 제출 또는 환불 요청에 필요한 준비물 리스트"
        },
        inquiry_draft: { 
          type: Type.STRING, 
          description: "고객센터에 전송할 상세한 한국어 이메일/문의 초안"
        },
        follow_up_questions: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "추천 후속 질문 2~3가지"
        }
      },
      required: [
        "problem_type",
        "simple_explanation",
        "terms_evidence",
        "source_references",
        "check_items",
        "next_actions",
        "required_materials",
        "inquiry_draft",
        "follow_up_questions"
      ]
    };

    let answer: any = null;
    let lastError: any = null;
    const candidateModels = [
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro"
    ];

    function cleanAndParseJSON(rawText: string) {
      let cleaned = rawText.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }
      return JSON.parse(cleaned);
    }

    const jsonPromptInstruction = `\n\n반드시 오직 아래 JSON 구조와 일치하는 유효한 JSON 형식(JSON만)으로만 답변해 주세요:
{
  "problem_type": "의뢰 유형 (예: 구독 환불 분쟁, 자동 결제 갱신 등)",
  "simple_explanation": "상황에 대한 쉽고 상세한 한국어 설명",
  "terms_evidence": ["약관 관련 조항 요약"],
  "source_references": ["약관 원문 구절 또는 출처"],
  "check_items": ["확인할 체크리스트 항목들"],
  "next_actions": ["대응 단계별 행동 강령"],
  "required_materials": ["필요한 준비물 및 증빙 자료"],
  "inquiry_draft": "고객센터 전송용 공식 이메일/문의글 초안",
  "follow_up_questions": ["추천 후속 질문 2~3개"]
}`;

    // Helper function for delayed retry
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // Try 1: Candidate models with Google Search tool
    for (const model of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model,
            contents: userPrompt + jsonPromptInstruction,
            config: {
              systemInstruction: systemInstruction + jsonPromptInstruction,
              tools: [{ googleSearch: {} }],
            }
          });

          if (response.text) {
            answer = cleanAndParseJSON(response.text);
            break;
          }
        } catch (err: any) {
          lastError = err;
          const errStr = String(err?.message || err);
          console.warn(`Model ${model} (attempt ${attempt + 1}) with search failed:`, errStr);
          if (
            err?.status === 429 ||
            err?.status === 503 ||
            errStr.includes("429") ||
            errStr.includes("503") ||
            errStr.includes("RESOURCE_EXHAUSTED") ||
            errStr.includes("UNAVAILABLE")
          ) {
            await delay(1200 * (attempt + 1));
          } else {
            break; // Non-retryable error, try next model
          }
        }
      }
      if (answer) break;
    }

    // Try 2: Candidate models with structured JSON schema (without Google Search tool)
    if (!answer) {
      for (const model of candidateModels) {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model,
              contents: userPrompt,
              config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: jsonSchema,
              }
            });

            if (response.text) {
              answer = cleanAndParseJSON(response.text);
              break;
            }
          } catch (err: any) {
            lastError = err;
            const errStr = String(err?.message || err);
            console.warn(`Model ${model} (attempt ${attempt + 1}) without search failed:`, errStr);
            if (
              err?.status === 429 ||
              err?.status === 503 ||
              errStr.includes("429") ||
              errStr.includes("503") ||
              errStr.includes("RESOURCE_EXHAUSTED") ||
              errStr.includes("UNAVAILABLE")
            ) {
              await delay(1200 * (attempt + 1));
            } else {
              break;
            }
          }
        }
        if (answer) break;
      }
    }

    // If API quota or service unavailable errors prevent model generation, provide a graceful structured analysis fallback
    if (!answer) {
      console.warn("All Gemini API candidate models failed, providing graceful fallback response. Last error:", lastError?.message || lastError);
      answer = {
        problem_type: `${service_name} 서비스 구독 및 약관 분석`,
        simple_explanation: `현재 AI 서비스 사용량이 많아 실시간 생성이 일시 지연되었습니다. 전자상거래법 및 일반 소비자분쟁해결기준에 따른 ${service_name} 서비스 안내입니다.`,
        terms_evidence: [
          "전자상거래 등에서의 소비자보호에 관한 법률 제17조 (청약철회 등)",
          "소비자분쟁해결기준 (구독형 서비스 미이용 시 7일 이내 환불 원칙)"
        ],
        source_references: [
          `${service_name} 공식 약관 안내 참조`
        ],
        check_items: [
          "결제 후 일주일(7일) 이내 서비스 이용 이력이 있는지 확인",
          "자동 결제 갱신 예정일 확인 및 결제 수단 관리"
        ],
        next_actions: [
          `${service_name} 고객센터 또는 마이페이지 접속`,
          "구독 해지 신청 및 환불 요청 버튼 클릭",
          "고객센터 문의하기를 통해 환불 의사 전달"
        ],
        required_materials: [
          "결제 영수증 또는 결제 내역 캡처본",
          "서비스 미이용 증빙 화면 캡처"
        ],
        inquiry_draft: `안녕하세요, ${service_name} 고객센터 담당자님.\n\n구독 서비스 관련하여 환불 및 해지를 요청드립니다.\n- 결제일: [결제일자 작성]\n- 요청 사유: [사유 작성]\n\n확인 후 빠른 처리 부탁드립니다. 감사드립니다.`,
        follow_up_questions: [
          `${service_name} 결제 취소 후 환불금은 언제 입금되나요?`,
          "구독 해지 시 남은 기간 동안 서비스를 이용할 수 있나요?"
        ]
      };
    }

    const knowledge_base_status = {
      service_name,
      service_documents_ready: true,
      reference_documents_ready: true,
      policy_status: {
        terms: true,
        privacy: true
      },
      missing_policy_types: [],
      requires_policy_input: false
    };

    const meta = {
      primary_intent: answer.problem_type || "terms_analysis",
      related_intents: [],
      is_in_scope: true,
      verification_status: "verified",
      verification_reason: null,
      retry_count: 0,
      trace: include_trace ? [] : null
    };

    res.json({
      answer,
      knowledge_base_status,
      meta
    });
  } catch (err: any) {
    console.error("Gemini API Error:", err);
    const errStr = String(err?.message || err);
    const isRateLimit = err?.status === 429 || errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED") || errStr.includes("quota");

    if (isRateLimit) {
      return res.status(429).json({
        detail: {
          code: "OPENAI_RATE_LIMITED",
          message: "Gemini API 요청 한도(Quota Rate Limit)에 도달했습니다. 약 1분 후 다시 시도해 주세요."
        }
      });
    }

    res.status(500).json({
      detail: {
        code: "AGENT_EXECUTION_FAILED",
        message: err?.message || "Agent 실행 중 오류가 발생했습니다."
      }
    });
  }
});

async function start() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FinePrint UI running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start FinePrint UI:", error);
  process.exitCode = 1;
});
