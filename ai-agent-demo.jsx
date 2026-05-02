import { useState, useEffect, useRef } from "react";

const SCENARIOS = {
  logistics: {
    intent: "物流查询",
    steps: [
      { type: "intent", label: "意图识别", detail: "分类: 物流查询 (confidence: 0.96)" },
      { type: "tool", label: "调用订单API", detail: "logistics_api.track(order_id='SH20260428X7')" },
      { type: "tool_result", label: "API 返回", detail: '{"carrier":"顺丰","status":"运输中","eta":"2026-05-03"}' },
      { type: "rag", label: "RAG 检索", detail: "检索到: 物流时效说明.md (相似度: 0.92)" },
      { type: "generate", label: "生成回复", detail: "综合 API 数据 + 知识库生成最终回答" },
    ],
    reply: "您好！已为您查询到订单 SH20260428X7 的物流信息：\n\n📦 承运商：顺丰速运\n🚚 当前状态：运输中，已到达广州分拨中心\n📅 预计送达：2026年5月3日\n\n如果超过预计日期仍未收到，可以随时联系我帮您催件。",
  },
  refund: {
    intent: "退款政策",
    steps: [
      { type: "intent", label: "意图识别", detail: "分类: 售后咨询-退款 (confidence: 0.93)" },
      { type: "rag", label: "RAG 检索", detail: "检索到: 退换货政策V3.2.md (相似度: 0.95)" },
      { type: "rag", label: "RAG 检索", detail: "检索到: 特殊品类退货规则.md (相似度: 0.87)" },
      { type: "generate", label: "生成回复", detail: "基于知识库内容生成结构化回答" },
    ],
    reply: "关于退款政策，为您整理如下：\n\n✅ 7天无理由退货：签收后7天内，商品未使用、包装完好即可申请\n✅ 退款时效：审核通过后 1-3 个工作日原路退回\n⚠️ 特殊说明：内衣、定制商品等贴身/个性化商品不支持无理由退货\n\n需要我帮您发起退款申请吗？",
  },
  complaint: {
    intent: "情绪投诉",
    steps: [
      { type: "intent", label: "意图识别", detail: "分类: 投诉/负面情绪 (confidence: 0.91)" },
      { type: "sentiment", label: "情绪检测", detail: "情绪: 愤怒 (score: 0.85) → 触发转人工" },
      { type: "handoff", label: "转接人工", detail: "携带对话上下文，分配至高优先级队列" },
    ],
    reply: "非常理解您的心情，遇到这样的情况确实让人着急。\n\n您的问题需要专人来处理，我正在为您转接人工客服，预计等待时间 < 30 秒。\n\n📋 已将您的对话记录同步给客服人员，无需重复描述问题。",
    isHandoff: true,
  },
  coupon: {
    intent: "优惠券咨询",
    steps: [
      { type: "intent", label: "意图识别", detail: "分类: 营销活动-优惠券 (confidence: 0.94)" },
      { type: "tool", label: "调用优惠券API", detail: 'coupon_api.query(user_id="U88321", status="active")' },
      { type: "tool_result", label: "API 返回", detail: '[{"code":"MAY50","discount":"满200减50","expire":"2026-05-15"}]' },
      { type: "rag", label: "RAG 检索", detail: "检索到: 优惠券使用规则.md (相似度: 0.91)" },
      { type: "generate", label: "生成回复", detail: "综合优惠券数据 + 使用规则生成回答" },
    ],
    reply: "您目前有 1 张可用优惠券：\n\n🎫 MAY50 — 满200减50\n📅 有效期至：2026年5月15日\n📌 使用范围：全品类通用（不含充值卡）\n\n下单时在结算页输入优惠码即可使用，需要我帮您推荐一些热销商品吗？",
  },
};

const QUICK_QUESTIONS = [
  { key: "logistics", text: "我的快递到哪了？", icon: "📦" },
  { key: "refund", text: "怎么申请退款？", icon: "💰" },
  { key: "complaint", text: "质量太差了 要投诉！", icon: "😡" },
  { key: "coupon", text: "我有什么优惠券可以用？", icon: "🎫" },
];

const TYPE_COLORS = {
  intent: { bg: "rgba(99,179,255,0.1)", border: "rgba(99,179,255,0.3)", text: "#63b3ff", icon: "🧠" },
  rag: { bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.3)", text: "#a78bfa", icon: "🔍" },
  tool: { bg: "rgba(34,211,238,0.1)", border: "rgba(34,211,238,0.3)", text: "#22d3ee", icon: "⚡" },
  tool_result: { bg: "rgba(52,211,153,0.1)", border: "rgba(52,211,153,0.3)", text: "#34d399", icon: "📋" },
  generate: { bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.3)", text: "#fbbf24", icon: "✨" },
  sentiment: { bg: "rgba(244,114,182,0.1)", border: "rgba(244,114,182,0.3)", text: "#f472b6", icon: "💗" },
  handoff: { bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.3)", text: "#f87171", icon: "🔄" },
};

export default function AIAgentDemo() {
  const [messages, setMessages] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [currentSteps, setCurrentSteps] = useState([]);
  const [showPipeline, setShowPipeline] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [started, setStarted] = useState(false);
  const [agentTyping, setAgentTyping] = useState(false);
  const chatEndRef = useRef(null);
  const pipelineRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentSteps, agentTyping]);

  useEffect(() => {
    if (currentSteps.length > 0 && pipelineRef.current) {
      pipelineRef.current.scrollTop = pipelineRef.current.scrollHeight;
    }
  }, [currentSteps]);

  const handleScenario = async (key) => {
    if (processing) return;
    const scenario = SCENARIOS[key];
    const userMsg = QUICK_QUESTIONS.find((q) => q.key === key).text;

    if (!started) setStarted(true);
    setProcessing(true);
    setShowPipeline(true);
    setCurrentSteps([]);
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);

    await sleep(400);

    for (let i = 0; i < scenario.steps.length; i++) {
      await sleep(600 + Math.random() * 400);
      setCurrentSteps((prev) => [...prev, { ...scenario.steps[i], animating: true }]);
      await sleep(200);
      setCurrentSteps((prev) =>
        prev.map((s, idx) => (idx === prev.length - 1 ? { ...s, animating: false } : s))
      );
    }

    await sleep(500);
    setAgentTyping(true);
    await sleep(1200);
    setAgentTyping(false);

    setMessages((prev) => [
      ...prev,
      {
        role: "agent",
        content: scenario.reply,
        intent: scenario.intent,
        isHandoff: scenario.isHandoff,
      },
    ]);
    setProcessing(false);
  };

  const handleCustomInput = () => {
    if (!inputValue.trim() || processing) return;
    const text = inputValue.trim();
    setInputValue("");

    let matchKey = null;
    if (/快递|物流|到哪|运输|发货/.test(text)) matchKey = "logistics";
    else if (/退[款货换]|退回|退钱/.test(text)) matchKey = "refund";
    else if (/投诉|差评|垃圾|太差|骗/.test(text)) matchKey = "complaint";
    else if (/优惠|券|折扣|活动|满减/.test(text)) matchKey = "coupon";
    else matchKey = "logistics";

    handleScenario(matchKey);
  };

  const resetDemo = () => {
    setMessages([]);
    setCurrentSteps([]);
    setShowPipeline(false);
    setStarted(false);
    setProcessing(false);
    setAgentTyping(false);
    setInputValue("");
  };

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>
            <div style={styles.logoDot} />
            <span style={styles.logoText}>ShopEase AI Agent</span>
          </div>
          <span style={styles.badge}>Interactive Demo</span>
        </div>
        <div style={styles.headerRight}>
          {started && (
            <button style={styles.resetBtn} onClick={resetDemo}>
              重新开始
            </button>
          )}
          <button
            style={{
              ...styles.pipelineToggle,
              background: showPipeline ? "rgba(99,179,255,0.15)" : "rgba(255,255,255,0.05)",
              borderColor: showPipeline ? "rgba(99,179,255,0.4)" : "rgba(255,255,255,0.1)",
            }}
            onClick={() => setShowPipeline(!showPipeline)}
          >
            {showPipeline ? "隐藏" : "显示"}推理过程
          </button>
        </div>
      </div>

      <div style={styles.body}>
        {/* Chat Area */}
        <div style={{ ...styles.chatArea, flex: showPipeline ? "1 1 55%" : "1 1 100%" }}>
          <div style={styles.chatMessages}>
            {/* Welcome */}
            {!started && (
              <div style={styles.welcome}>
                <div style={styles.welcomeIcon}>🤖</div>
                <div style={styles.welcomeTitle}>你好，我是 ShopEase 智能客服</div>
                <div style={styles.welcomeSub}>
                  我可以帮你查物流、解答退款政策、查询优惠券等。
                  <br />
                  点击下方问题或直接输入试试看：
                </div>
                <div style={styles.quickGrid}>
                  {QUICK_QUESTIONS.map((q) => (
                    <button key={q.key} style={styles.quickBtn} onClick={() => handleScenario(q.key)}>
                      <span style={styles.quickIcon}>{q.icon}</span>
                      <span>{q.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  ...styles.messageRow,
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  animation: "fadeSlideIn 0.35s ease both",
                }}
              >
                {msg.role === "agent" && <div style={styles.agentAvatar}>🤖</div>}
                <div
                  style={
                    msg.role === "user"
                      ? styles.userBubble
                      : msg.isHandoff
                        ? styles.handoffBubble
                        : styles.agentBubble
                  }
                >
                  {msg.intent && (
                    <div style={styles.intentTag}>
                      {msg.isHandoff ? "🔄" : "✅"} {msg.intent}
                      {msg.isHandoff && <span style={styles.handoffTag}>已转人工</span>}
                    </div>
                  )}
                  <div style={styles.messageText}>
                    {msg.content.split("\n").map((line, j) => (
                      <div key={j} style={{ minHeight: line ? "auto" : "8px" }}>
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {agentTyping && (
              <div style={{ ...styles.messageRow, justifyContent: "flex-start", animation: "fadeSlideIn 0.3s ease" }}>
                <div style={styles.agentAvatar}>🤖</div>
                <div style={styles.typingBubble}>
                  <div style={styles.typingDots}>
                    <span style={{ ...styles.dot, animationDelay: "0s" }} />
                    <span style={{ ...styles.dot, animationDelay: "0.15s" }} />
                    <span style={{ ...styles.dot, animationDelay: "0.3s" }} />
                  </div>
                </div>
              </div>
            )}

            {/* Post-reply quick actions */}
            {started && !processing && messages.length > 0 && messages[messages.length - 1].role === "agent" && (
              <div style={styles.postActions}>
                <div style={styles.postLabel}>继续问：</div>
                <div style={styles.postBtns}>
                  {QUICK_QUESTIONS.filter(
                    (q) => !messages.some((m) => m.role === "user" && m.content === q.text)
                  )
                    .slice(0, 3)
                    .map((q) => (
                      <button key={q.key} style={styles.postBtn} onClick={() => handleScenario(q.key)}>
                        {q.icon} {q.text}
                      </button>
                    ))}
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div style={styles.inputBar}>
            <input
              style={styles.input}
              placeholder="输入你的问题..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCustomInput()}
              disabled={processing}
            />
            <button
              style={{
                ...styles.sendBtn,
                opacity: inputValue.trim() && !processing ? 1 : 0.4,
              }}
              onClick={handleCustomInput}
              disabled={!inputValue.trim() || processing}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Pipeline Panel */}
        {showPipeline && (
          <div style={styles.pipelinePanel} ref={pipelineRef}>
            <div style={styles.pipelineHeader}>
              <span style={styles.pipelineIcon}>⚙️</span>
              <span style={styles.pipelineTitle}>Agent 推理链路</span>
            </div>

            {currentSteps.length === 0 && !processing && (
              <div style={styles.pipelineEmpty}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>🔬</div>
                <div>发送消息后</div>
                <div>这里会展示 Agent 的</div>
                <div>完整推理过程</div>
              </div>
            )}

            {currentSteps.map((step, i) => {
              const color = TYPE_COLORS[step.type];
              return (
                <div
                  key={i}
                  style={{
                    ...styles.stepCard,
                    borderColor: color.border,
                    background: color.bg,
                    animation: "stepAppear 0.4s ease both",
                  }}
                >
                  <div style={styles.stepHeader}>
                    <span style={{ fontSize: 14 }}>{color.icon}</span>
                    <span style={{ ...styles.stepLabel, color: color.text }}>{step.label}</span>
                    <span style={{ ...styles.stepIndex, color: color.text }}>#{i + 1}</span>
                  </div>
                  <div style={styles.stepDetail}>
                    <code style={{ ...styles.stepCode, color: "rgba(255,255,255,0.7)" }}>{step.detail}</code>
                  </div>
                </div>
              );
            })}

            {processing && currentSteps.length > 0 && (
              <div style={styles.processingIndicator}>
                <div style={styles.spinner} />
                <span>处理中...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Architecture note */}
      <div style={styles.archBar}>
        <span style={styles.archItem}>
          <span style={styles.archDot("#63b3ff")} />
          Claude Sonnet
        </span>
        <span style={styles.archItem}>
          <span style={styles.archDot("#a78bfa")} />
          Milvus 向量库
        </span>
        <span style={styles.archItem}>
          <span style={styles.archDot("#22d3ee")} />
          LangGraph 编排
        </span>
        <span style={styles.archItem}>
          <span style={styles.archDot("#f472b6")} />
          情绪检测
        </span>
      </div>

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes stepAppear {
          from { opacity: 0; transform: translateX(-12px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        input::placeholder { color: rgba(255,255,255,0.25); }
        *::-webkit-scrollbar { width: 5px; }
        *::-webkit-scrollbar-track { background: transparent; }
        *::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
      `}</style>
    </div>
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const styles = {
  wrapper: {
    width: "100%",
    maxWidth: 960,
    margin: "0 auto",
    background: "#0a0c14",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.06)",
    overflow: "hidden",
    fontFamily: "'Outfit', 'Noto Sans SC', -apple-system, sans-serif",
    display: "flex",
    flexDirection: "column",
    height: "min(680px, 85vh)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 20px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.02)",
    flexShrink: 0,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  logo: { display: "flex", alignItems: "center", gap: 8 },
  logoDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#22d3ee",
    boxShadow: "0 0 8px rgba(34,211,238,0.5)",
  },
  logoText: {
    fontSize: 14,
    fontWeight: 600,
    color: "#e8edf5",
    letterSpacing: "0.3px",
  },
  badge: {
    fontSize: 10,
    fontWeight: 500,
    color: "#a78bfa",
    background: "rgba(167,139,250,0.1)",
    border: "1px solid rgba(167,139,250,0.2)",
    padding: "2px 8px",
    borderRadius: 100,
    letterSpacing: "0.5px",
  },
  resetBtn: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#7b8ba5",
    padding: "6px 14px",
    borderRadius: 8,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  pipelineToggle: {
    border: "1px solid",
    color: "#63b3ff",
    padding: "6px 14px",
    borderRadius: 8,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: 500,
  },
  body: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  },
  chatArea: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    transition: "flex 0.3s ease",
  },
  chatMessages: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 20px 8px",
  },
  welcome: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "40px 16px 20px",
    textAlign: "center",
  },
  welcomeIcon: { fontSize: 40, marginBottom: 16 },
  welcomeTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "#e8edf5",
    marginBottom: 8,
  },
  welcomeSub: {
    fontSize: 13,
    color: "#7b8ba5",
    lineHeight: 1.7,
    marginBottom: 28,
  },
  quickGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    width: "100%",
    maxWidth: 380,
  },
  quickBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 14px",
    borderRadius: 10,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#e8edf5",
    fontSize: 13,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "inherit",
    transition: "all 0.2s",
  },
  quickIcon: { fontSize: 16, flexShrink: 0 },
  messageRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 16,
  },
  agentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: "rgba(99,179,255,0.1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    flexShrink: 0,
    marginTop: 2,
  },
  userBubble: {
    background: "linear-gradient(135deg, rgba(99,179,255,0.2), rgba(167,139,250,0.15))",
    border: "1px solid rgba(99,179,255,0.2)",
    borderRadius: "16px 16px 4px 16px",
    padding: "12px 16px",
    maxWidth: "75%",
  },
  agentBubble: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "16px 16px 16px 4px",
    padding: "14px 16px",
    maxWidth: "80%",
  },
  handoffBubble: {
    background: "rgba(248,113,113,0.06)",
    border: "1px solid rgba(248,113,113,0.15)",
    borderRadius: "16px 16px 16px 4px",
    padding: "14px 16px",
    maxWidth: "80%",
  },
  intentTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    color: "#63b3ff",
    background: "rgba(99,179,255,0.08)",
    padding: "3px 10px",
    borderRadius: 100,
    marginBottom: 10,
    fontWeight: 500,
  },
  handoffTag: {
    background: "rgba(248,113,113,0.15)",
    color: "#f87171",
    padding: "1px 8px",
    borderRadius: 100,
    marginLeft: 6,
    fontSize: 10,
  },
  messageText: {
    fontSize: 13.5,
    lineHeight: 1.75,
    color: "#e8edf5",
  },
  typingBubble: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "16px 16px 16px 4px",
    padding: "14px 20px",
  },
  typingDots: { display: "flex", gap: 5 },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "#7b8ba5",
    animation: "bounce 1.2s ease infinite",
    display: "inline-block",
  },
  postActions: {
    padding: "4px 0 8px 42px",
  },
  postLabel: {
    fontSize: 11,
    color: "#4a5568",
    marginBottom: 8,
  },
  postBtns: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  postBtn: {
    fontSize: 12,
    color: "#7b8ba5",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 8,
    padding: "7px 12px",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "all 0.2s",
  },
  inputBar: {
    display: "flex",
    gap: 8,
    padding: "12px 16px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10,
    padding: "10px 16px",
    color: "#e8edf5",
    fontSize: 13,
    outline: "none",
    fontFamily: "inherit",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: "linear-gradient(135deg, #63b3ff, #a78bfa)",
    border: "none",
    color: "#0a0b10",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
    transition: "opacity 0.2s",
  },
  pipelinePanel: {
    width: "40%",
    maxWidth: 340,
    borderLeft: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.015)",
    overflowY: "auto",
    padding: "16px",
    flexShrink: 0,
  },
  pipelineHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  pipelineIcon: { fontSize: 14 },
  pipelineTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "#7b8ba5",
    letterSpacing: "1px",
    textTransform: "uppercase",
  },
  pipelineEmpty: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "60%",
    fontSize: 12,
    color: "#4a5568",
    textAlign: "center",
    lineHeight: 1.8,
  },
  stepCard: {
    border: "1px solid",
    borderRadius: 10,
    padding: "12px 14px",
    marginBottom: 10,
  },
  stepHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: 600,
    flex: 1,
  },
  stepIndex: {
    fontSize: 10,
    fontWeight: 500,
    opacity: 0.6,
  },
  stepDetail: {
    overflow: "hidden",
  },
  stepCode: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    lineHeight: 1.6,
    wordBreak: "break-all",
  },
  processingIndicator: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    padding: "12px 0",
    fontSize: 12,
    color: "#7b8ba5",
  },
  spinner: {
    width: 14,
    height: 14,
    border: "2px solid rgba(99,179,255,0.2)",
    borderTopColor: "#63b3ff",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  archBar: {
    display: "flex",
    justifyContent: "center",
    gap: 20,
    padding: "12px 16px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(255,255,255,0.015)",
    flexWrap: "wrap",
    flexShrink: 0,
  },
  archItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11,
    color: "#4a5568",
    fontFamily: "'JetBrains Mono', monospace",
  },
  archDot: (color) => ({
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: color,
    display: "inline-block",
    flexShrink: 0,
  }),
};
