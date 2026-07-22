import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle, ChevronLeft, FileText, Globe, HelpCircle, MessageSquare, Play, Search, Sparkles, Upload } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { AnalysisType, AnalyzeSubmission, DocumentType } from "../lib/fineprintApi";

interface HomeWorkspaceProps {
  onAnalyze: (submission: AnalyzeSubmission) => void;
  isLoading: boolean;
  fallbackServiceName?: string | null;
  sharedServiceName?: string;
  onServiceNameChange?: (name: string) => void;
}

export default function HomeWorkspace({
  onAnalyze,
  isLoading,
  fallbackServiceName,
  sharedServiceName = "",
  onServiceNameChange,
}: HomeWorkspaceProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [activeTab, setActiveTab] = useState<AnalysisType>("name");
  const [serviceName, setServiceName] = useState(sharedServiceName || fallbackServiceName || "");
  const [question, setQuestion] = useState("");
  const [url, setUrl] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("terms");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (fallbackServiceName) {
      setServiceName(fallbackServiceName);
      setActiveTab("url");
      setStep(1);
    }
  }, [fallbackServiceName]);

  useEffect(() => {
    if (sharedServiceName !== undefined && sharedServiceName !== serviceName && !fallbackServiceName) {
      setServiceName(sharedServiceName);
    }
  }, [sharedServiceName]);

  const handleServiceNameChange = (value: string) => {
    setServiceName(value);
    if (onServiceNameChange) {
      onServiceNameChange(value);
    }
  };

  const selectTab = (tab: AnalysisType) => {
    setActiveTab(tab);
    setUrl("");
    setFile(null);
  };

  const handleNextStep = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const normalizedName = serviceName.trim();
    if (!normalizedName) return;
    if (activeTab === "url" && !url.trim()) return;
    if (activeTab === "document" && !file) return;

    setStep(2);
  };

  const handleSubmit = (event: React.FormEvent, customQuestion?: string) => {
    event.preventDefault();
    const normalizedName = serviceName.trim();
    if (!normalizedName) return;
    if (activeTab === "url" && !url.trim()) return;
    if (activeTab === "document" && !file) return;

    const finalQuestion = customQuestion !== undefined ? customQuestion : question.trim();

    onAnalyze({
      type: activeTab,
      serviceName: normalizedName,
      question: finalQuestion || undefined,
      url: activeTab === "url" ? url.trim() : undefined,
      documentType: activeTab === "name" ? undefined : documentType,
      file: activeTab === "document" ? file || undefined : undefined,
    });
  };

  const acceptFile = (candidate: File) => {
    const extension = candidate.name.split(".").pop()?.toLowerCase();
    if (extension !== "pdf" && extension !== "txt") return;
    setFile(candidate);
  };

  const isStep1Valid =
    serviceName.trim().length > 0 &&
    (activeTab === "name" ||
      (activeTab === "url" && url.trim().length > 0) ||
      (activeTab === "document" && Boolean(file)));

  const presetQuestions = [
    "중도 해지 시 남은 기간에 대한 환불 규정이 궁금해요.",
    "무료 체험 종료 후 자동 결제 취소 방법 및 기한 안내",
    "서비스 해지 시 결제 주기가 끝날 때까지 이용 가능한가요?",
    "기본 해지, 환불 및 위약금 관련 정책 전체 분석"
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-start md:justify-center px-6 md:px-12 py-12 relative overflow-y-auto w-full h-full">
      <div className="max-w-3xl w-full text-center mb-8 z-10">
        <div className="flex justify-center mb-5">
          <img
            alt="FinePrint Logo"
            className="w-[640px] md:w-[800px] max-w-full h-auto object-contain select-none pointer-events-none"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuB550ld8eJ9KDDoWjvwOC1BWPx3hrruSwjWkIRsgGXnrETxzT0BoA4NPcoVP_jp1wMW6MW1lbmgaby9_7ZccuEw9qo00lnPVX4CqJBc-7KXMLQKuWBtHJQeWBOM_OYFVt1wrnRmEsTd5RrJxbN4lGyzm5hijJrNxh6lFwoIZ1X6EQCkeYNG_z3rdvKxjaAC23wGPWvX17uUZriDR0il5EEn674HOgxCjhi7otMNdGtbHkqj72oUY9PNiq2sWdNDQL6MEw"
            referrerPolicy="no-referrer"
          />
        </div>
        <h2 className="text-2xl md:text-4xl font-headline font-bold text-on-surface mb-3 tracking-tight">
          구독 서비스 약관 분석 및 문제 해결 안내 서비스
        </h2>
        <p className="text-sm md:text-base text-on-surface-variant max-w-xl mx-auto opacity-90 leading-relaxed">
          서비스명을 입력하면 기존 DB를 확인하고, 없을 때 공식 약관을 자동으로 수집합니다.
        </p>
      </div>

      <div className="w-full max-w-2xl z-10">
        {fallbackServiceName && (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 flex gap-3 text-left shadow-sm">
            <AlertTriangle className="text-amber-600 shrink-0" size={20} />
            <div>
              <p className="text-sm font-bold text-amber-900">자동 수집에서 약관을 찾지 못했습니다.</p>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                <strong>{fallbackServiceName}</strong>의 공식 약관 URL을 입력하거나 PDF/TXT 파일을 업로드해 주세요.
              </p>
            </div>
          </div>
        )}

        {/* Read-only Step Status Indicator */}
        <div className="flex items-center justify-between max-w-md mx-auto mb-6 bg-surface-white/80 backdrop-blur-sm border border-border-muted p-1.5 rounded-2xl shadow-xs select-none">
          <div
            className={`flex-1 py-2 px-3 rounded-xl text-xs md:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              step === 1
                ? "bg-primary text-on-primary shadow-xs"
                : "text-primary/90 bg-primary/10"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                step === 1 ? "bg-white/20 text-current" : "bg-primary text-white"
              }`}
            >
              1
            </span>
            <span>1단계: 서비스 선택</span>
          </div>

          <div className="w-6 h-[2px] bg-border-muted shrink-0 mx-1" />

          <div
            className={`flex-1 py-2 px-3 rounded-xl text-xs md:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              step === 2
                ? "bg-primary text-on-primary shadow-xs"
                : "text-on-surface-variant/50"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-black ${
                step === 2 ? "bg-white/20 text-current" : "bg-slate-200 text-slate-500"
              }`}
            >
              2
            </span>
            <span>2단계: 질문 입력</span>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 15 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex justify-center gap-3 md:gap-4 mb-5">
                {([
                  ["name", Search, "서비스명 검색"],
                  ["url", Globe, "URL 직접 입력"],
                  ["document", FileText, "문서 파일 업로드"],
                ] as const).map(([tab, Icon, label]) => (
                  <button
                    key={tab}
                    id={`tab-${tab}`}
                    type="button"
                    onClick={() => selectTab(tab)}
                    className={`px-4 md:px-5 py-2.5 rounded-xl text-xs md:text-sm font-semibold transition-all flex items-center gap-2 border active:scale-95 cursor-pointer ${
                      activeTab === tab
                        ? "bg-primary text-on-primary border-primary shadow-sm"
                        : "bg-surface-white text-on-surface border-outline-variant/30 hover:border-primary/50"
                    }`}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleNextStep} className="relative bg-surface-white border-2 border-border-muted rounded-3xl p-5 md:p-7 shadow-sm space-y-4">
                <label className="block">
                  <span className="block text-xs font-bold text-on-surface-variant mb-2">
                    {activeTab === "name" ? "분석할 구독 서비스명" : "서비스명 입력"}
                  </span>
                  <div className="flex items-center gap-3 rounded-xl border border-border-muted px-4 py-3.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 bg-surface-white transition-all">
                    <Search size={18} className="text-primary shrink-0" />
                    <input
                      id="service-name-input"
                      value={serviceName}
                      onChange={(event) => handleServiceNameChange(event.target.value)}
                      disabled={isLoading}
                      placeholder="예: TVING, Netflix, Adobe Creative Cloud, 쿠팡와우"
                      className="w-full bg-transparent outline-none text-sm md:text-base font-medium text-on-surface placeholder-on-surface-variant/40"
                    />
                  </div>
                </label>

                {activeTab !== "name" && (
                  <label className="block">
                    <span className="block text-xs font-bold text-on-surface-variant mb-2">문서 종류</span>
                    <select
                      value={documentType}
                      onChange={(event) => setDocumentType(event.target.value as DocumentType)}
                      disabled={isLoading}
                      className="w-full rounded-xl border border-border-muted bg-white px-4 py-3 text-sm outline-none focus:border-primary"
                    >
                      <option value="terms">이용약관 및 결제/환불 규정</option>
                      <option value="privacy">개인정보처리방침</option>
                    </select>
                  </label>
                )}

                {activeTab === "url" && (
                  <label className="block">
                    <span className="block text-xs font-bold text-on-surface-variant mb-2">공식 약관 URL</span>
                    <div className="flex items-center gap-3 rounded-xl border border-border-muted px-4 py-3.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                      <Globe size={18} className="text-primary shrink-0" />
                      <input
                        id="policy-url-input"
                        type="url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        disabled={isLoading}
                        placeholder="https://example.com/terms"
                        className="w-full bg-transparent outline-none text-sm text-on-surface placeholder-on-surface-variant/40"
                      />
                    </div>
                  </label>
                )}

                {activeTab === "document" && (
                  <div>
                    <input
                      ref={fileInputRef}
                      id="file-picker-input"
                      type="file"
                      accept=".pdf,.txt,application/pdf,text/plain"
                      className="hidden"
                      onChange={(event) => event.target.files?.[0] && acceptFile(event.target.files[0])}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setIsDragging(false);
                        if (event.dataTransfer.files[0]) acceptFile(event.dataTransfer.files[0]);
                      }}
                      className={`w-full rounded-2xl border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
                        isDragging ? "border-primary bg-primary/10" : "border-border-muted hover:border-primary/50"
                      }`}
                    >
                      <Upload size={25} className="mx-auto text-primary mb-2" />
                      <p className="text-sm font-bold text-on-surface">
                        {file ? file.name : "PDF/TXT 약관 파일 선택 또는 드래그"}
                      </p>
                      <p className="text-xs text-on-surface-variant/60 mt-1">
                        {file ? `${(file.size / 1024).toFixed(1)} KB` : "최대 20MB"}
                      </p>
                    </button>
                  </div>
                )}

                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <button
                    id="btn-goto-step2"
                    type="submit"
                    disabled={isLoading || !isStep1Valid}
                    className={`flex-1 rounded-xl py-3.5 px-5 flex items-center justify-center gap-2 font-bold text-sm transition-all ${
                      isStep1Valid && !isLoading
                        ? "bg-primary text-on-primary hover:bg-primary/90 cursor-pointer active:scale-[0.99] shadow-sm"
                        : "bg-outline-variant/40 text-on-surface-variant/50 cursor-not-allowed"
                    }`}
                  >
                    <span>다음: 질문 작성하기</span>
                    <ArrowRight size={17} />
                  </button>

                  <button
                    id="btn-direct-analyze"
                    type="button"
                    disabled={isLoading || !isStep1Valid}
                    onClick={(e) => handleSubmit(e, "")}
                    className={`px-5 py-3.5 rounded-xl border border-border-muted font-semibold text-xs md:text-sm transition-all ${
                      isStep1Valid && !isLoading
                        ? "bg-surface-white text-on-surface-variant hover:text-on-surface hover:bg-slate-50 cursor-pointer"
                        : "text-on-surface-variant/40 border-slate-200 cursor-not-allowed"
                    }`}
                  >
                    질문 없이 기본 약관 바로 분석
                  </button>
                </div>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              transition={{ duration: 0.2 }}
            >
              <div className="bg-surface-white border-2 border-border-muted rounded-3xl p-5 md:p-7 shadow-sm space-y-5">
                {/* Selected Service Badge */}
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 p-3.5 rounded-2xl">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <CheckCircle size={18} />
                    </span>
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">선택한 서비스</span>
                      <strong className="text-sm md:text-base font-bold text-on-surface">{serviceName}</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    변경하기
                  </button>
                </div>

                {/* Question Input Section */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label htmlFor="user-question-textarea" className="text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                      <MessageSquare size={15} className="text-primary shrink-0" />
                      약관에서 특히 궁금한 내용을 입력해 주세요
                    </label>
                    <span className="text-[11px] font-medium text-slate-400">선택 사항</span>
                  </div>

                  <textarea
                    id="user-question-textarea"
                    rows={3}
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    disabled={isLoading}
                    placeholder="예: 중도 해지하면 남은 날짜만큼 환불해 주나요? 자동 결제가 다음 달에 진행 안 되게 취소하는 방법도 알려주세요."
                    className="w-full rounded-2xl border border-border-muted p-4 text-sm text-on-surface placeholder-on-surface-variant/40 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all resize-none bg-surface-white"
                  />
                </div>

                {/* Recommended Preset Question Chips */}
                <div>
                  <span className="block text-[11px] font-bold text-slate-500 mb-2.5 flex items-center gap-1">
                    <Sparkles size={13} className="text-amber-500" /> 자주 묻는 추천 질문 클릭:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {presetQuestions.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setQuestion(preset)}
                        className={`text-left text-xs px-3.5 py-2 rounded-xl border transition-all cursor-pointer ${
                          question === preset
                            ? "bg-primary/10 border-primary text-primary font-bold shadow-2xs"
                            : "bg-slate-50 border-slate-200 text-slate-700 hover:border-primary/40 hover:bg-white"
                        }`}
                      >
                        💡 {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 2 Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    disabled={isLoading}
                    className="px-4 py-3.5 rounded-xl border border-border-muted font-bold text-xs md:text-sm text-on-surface-variant hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ChevronLeft size={17} />
                    <span>이전 단계</span>
                  </button>

                  <button
                    id="analysis-submit"
                    type="button"
                    onClick={(e) => handleSubmit(e)}
                    disabled={isLoading}
                    className="flex-1 rounded-xl py-3.5 px-6 bg-primary text-on-primary hover:bg-primary/90 font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.99]"
                  >
                    {isLoading ? (
                      <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Play size={17} fill="currentColor" />
                    )}
                    <span>
                      {question.trim() ? "질문으로 약관 분석 시작하기" : "약관 종합 분석 시작하기"}
                    </span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
