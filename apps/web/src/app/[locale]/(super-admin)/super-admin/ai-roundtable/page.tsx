"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Play, Download, RefreshCw, Sparkles } from "lucide-react";

interface Message {
  speaker: string;
  role: string;
  content: string;
  color: string;
  round: number;
}

const SPEAKER_ICONS: Record<string, { bg: string; text: string; emoji: string }> = {
  Claude: { bg: "bg-amber-500/10", text: "text-amber-600", emoji: "🟠" },
  "GPT-4o": { bg: "bg-green-500/10", text: "text-green-600", emoji: "🟢" },
  Gemini: { bg: "bg-blue-500/10", text: "text-blue-600", emoji: "🔵" },
};

const DEFAULT_TOPICS = [
  "Quelles sont les 3 fonctionnalités manquantes les plus critiques pour un chef de projet construction en Suisse ?",
  "Comment améliorer le taux de conversion du trial vers un plan payant ?",
  "Quelle killer feature différencierait Cantaia de Procore/BauMaster/Dalux ?",
  "Comment l'IA pourrait être mieux intégrée dans le workflow quotidien ?",
  "Quelles améliorations UX prioritaires pour les utilisateurs mobiles sur le terrain ?",
];

export default function AIRoundtablePage() {
  const [topic, setTopic] = useState(DEFAULT_TOPICS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [rounds, setRounds] = useState(3);
  const [loading, setLoading] = useState(false);
  const [conversation, setConversation] = useState<Message[]>([]);
  const [synthesis, setSynthesis] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [thinking, setThinking] = useState<{ speaker: string; role: string } | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  // Detect if user scrolled up (window scroll)
  useEffect(() => {
    function handleScroll() {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      userScrolledUp.current = scrollHeight - scrollTop - clientHeight > 200;
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-scroll only if user is near the bottom
  useEffect(() => {
    if (!userScrolledUp.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation.length, thinking, synthesis]);

  async function startRoundtable() {
    setLoading(true);
    setConversation([]);
    setSynthesis("");
    setError("");
    setThinking(null);
    const start = Date.now();

    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);

    try {
      const res = await fetch("/api/super-admin/ai-roundtable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: customTopic.trim() || topic,
          rounds,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur serveur");
        clearInterval(timer);
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError("Streaming not supported");
        clearInterval(timer);
        setLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "thinking") {
                setThinking({ speaker: data.speaker, role: data.role });
              } else if (data.type === "message") {
                setThinking(null);
                setConversation(prev => [...prev, {
                  speaker: data.speaker,
                  role: data.role,
                  content: data.content,
                  color: data.color,
                  round: data.round,
                }]);
              } else if (data.type === "synthesis") {
                setThinking(null);
                setSynthesis(data.content);
              } else if (data.type === "done") {
                setLoading(false);
              }
            } catch {
              // Ignore malformed SSE data
            }
          }
        }
      }
    } catch (e: any) {
      setError(e.message || "Erreur réseau");
    } finally {
      clearInterval(timer);
      setElapsed(Math.floor((Date.now() - start) / 1000));
      setLoading(false);
    }
  }

  function exportMarkdown() {
    const md = [
      `# Table Ronde IA — Cantaia`,
      `**Date:** ${new Date().toLocaleDateString("fr-CH")}`,
      `**Sujet:** ${customTopic.trim() || topic}`,
      `**Tours:** ${rounds}`,
      ``,
      `---`,
      ``,
      ...conversation.map(m => [
        `### ${m.speaker} (${m.role}) — Tour ${m.round}`,
        ``,
        m.content,
        ``,
      ]).flat(),
      `---`,
      ``,
      `## Synthèse`,
      ``,
      synthesis,
    ].join("\n");

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cantaia-roundtable-${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Group messages by round for display
  const groupedByRound: Record<number, Message[]> = {};
  for (const m of conversation) {
    if (!groupedByRound[m.round]) groupedByRound[m.round] = [];
    groupedByRound[m.round].push(m);
  }

  // Determine the current round from the latest message or thinking state
  const showConfig = conversation.length === 0 && !loading;
  const showConversation = conversation.length > 0 || loading;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 via-green-500 to-blue-500">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[#FAFAFA]">Table Ronde IA</h1>
            <p className="text-sm text-[#71717A]">Claude x GPT-4o x Gemini discutent de Cantaia</p>
          </div>
        </div>
      </div>

      {/* Config — shown only when no conversation and not loading */}
      {showConfig && (
        <div className="space-y-6">
          {/* Topic selection */}
          <div className="rounded-lg border border-[#27272A] p-6 space-y-4">
            <h3 className="text-sm font-semibold text-[#FAFAFA]">Choisissez un sujet</h3>
            <div className="space-y-2">
              {DEFAULT_TOPICS.map((t, i) => (
                <label
                  key={i}
                  className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                    topic === t && !customTopic.trim() ? "border-[#F97316] bg-[#F97316]/5" : "border-[#27272A] hover:bg-[#27272A]/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="topic"
                    checked={topic === t && !customTopic.trim()}
                    onChange={() => { setTopic(t); setCustomTopic(""); }}
                    className="mt-0.5"
                  />
                  <span className="text-sm text-[#FAFAFA]">{t}</span>
                </label>
              ))}
            </div>

            <div className="pt-2">
              <label className="block text-xs font-medium text-[#71717A] mb-1">Ou posez votre propre question</label>
              <textarea
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="Ex: Comment réduire le churn après le premier mois ?"
                rows={2}
                className="w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] placeholder-muted-foreground focus:border-[#F97316] focus:outline-none"
              />
            </div>
          </div>

          {/* Rounds */}
          <div className="rounded-lg border border-[#27272A] p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#FAFAFA]">Nombre de tours</h3>
                <p className="text-xs text-[#71717A] mt-0.5">Plus de tours = discussion plus approfondie mais plus longue (~1 min/tour)</p>
              </div>
              <div className="flex items-center gap-3">
                {[3, 5, 10].map(n => (
                  <button
                    key={n}
                    onClick={() => setRounds(n)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      rounds === n ? "bg-[#F97316] text-white" : "bg-[#27272A] text-[#FAFAFA] hover:bg-[#27272A]/80"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={rounds}
                  onChange={(e) => setRounds(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                  className="w-16 rounded-md border border-[#27272A] bg-[#0F0F11] px-2 py-1.5 text-sm text-[#FAFAFA] text-center"
                />
              </div>
            </div>
          </div>

          {/* Participants */}
          <div className="rounded-lg border border-[#27272A] p-6">
            <h3 className="text-sm font-semibold text-[#FAFAFA] mb-3">Participants</h3>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 text-center">
                <p className="text-lg">{SPEAKER_ICONS.Claude.emoji}</p>
                <p className="text-sm font-medium text-[#FAFAFA]">Claude</p>
                <p className="text-xs text-[#71717A]">Architecte Produit</p>
              </div>
              <div className="rounded-lg bg-green-500/5 border border-green-500/20 p-3 text-center">
                <p className="text-lg">{SPEAKER_ICONS["GPT-4o"].emoji}</p>
                <p className="text-sm font-medium text-[#FAFAFA]">GPT-4o</p>
                <p className="text-xs text-[#71717A]">UX Designer & Stratège</p>
              </div>
              <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3 text-center">
                <p className="text-lg">{SPEAKER_ICONS.Gemini.emoji}</p>
                <p className="text-sm font-medium text-[#FAFAFA]">Gemini</p>
                <p className="text-xs text-[#71717A]">Product Manager</p>
              </div>
            </div>
          </div>

          {/* Launch */}
          <button
            onClick={startRoundtable}
            className="w-full rounded-lg bg-gradient-to-r from-amber-500 via-green-500 to-blue-500 px-6 py-3 text-white font-semibold text-base hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            <Play className="h-5 w-5" />
            Lancer la table ronde ({rounds} tours x 3 IA)
          </button>
        </div>
      )}

      {/* Conversation — shown during loading (messages stream in) and after completion */}
      {showConversation && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-[#71717A]">Sujet</p>
              <p className="text-base font-medium text-[#FAFAFA]">{customTopic.trim() || topic}</p>
              <p className="text-xs text-[#71717A] mt-0.5">
                {conversation.length} messages &middot; {Object.keys(groupedByRound).length} tours &middot; {elapsed}s
                {loading && " — en cours..."}
              </p>
            </div>
            {!loading && (
              <div className="flex gap-2">
                <button
                  onClick={exportMarkdown}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-sm text-[#FAFAFA] hover:bg-[#27272A]"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export .md
                </button>
                <button
                  onClick={() => { setConversation([]); setSynthesis(""); setThinking(null); }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-sm text-[#FAFAFA] hover:bg-[#27272A]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Nouvelle session
                </button>
              </div>
            )}
          </div>

          {/* Initial loading state — before first message arrives */}
          {loading && conversation.length === 0 && !thinking && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center animate-pulse">{SPEAKER_ICONS.Claude.emoji}</div>
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center animate-pulse" style={{ animationDelay: "0.3s" }}>{SPEAKER_ICONS["GPT-4o"].emoji}</div>
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center animate-pulse" style={{ animationDelay: "0.6s" }}>{SPEAKER_ICONS.Gemini.emoji}</div>
              </div>
              <p className="text-[#FAFAFA] font-medium">Lancement de la table ronde...</p>
              <p className="text-xs text-[#71717A] mt-1">{elapsed}s</p>
            </div>
          )}

          {/* Conversation by round */}
          {Object.entries(groupedByRound).map(([round, messages]) => (
            <div key={round}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-[#71717A] uppercase tracking-wider">Tour {round}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-3">
                {messages.map((m, i) => {
                  const style = SPEAKER_ICONS[m.speaker] || SPEAKER_ICONS.Claude;
                  return (
                    <div key={`${round}-${i}`} className={`rounded-lg border border-[#27272A] p-4 ${style.bg}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span>{style.emoji}</span>
                        <span className={`text-sm font-semibold ${style.text}`}>{m.speaker}</span>
                        <span className="text-xs text-[#71717A]">— {m.role}</span>
                      </div>
                      <div className="text-sm text-[#FAFAFA] whitespace-pre-wrap leading-relaxed">{m.content}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Thinking indicator — shown while an AI is generating */}
          {thinking && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[#27272A] bg-[#27272A]/20 animate-pulse">
              <span>{SPEAKER_ICONS[thinking.speaker]?.emoji || "🤔"}</span>
              <span className="text-sm text-[#71717A]">
                <span className="font-medium text-[#FAFAFA]">{thinking.speaker}</span> ({thinking.role}) réfléchit...
              </span>
              <span className="text-xs text-[#71717A] ml-auto">{elapsed}s</span>
            </div>
          )}

          {/* Synthesis */}
          {synthesis && (
            <div className="rounded-lg border-2 border-[#F97316]/30 bg-[#F97316]/5 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-5 w-5 text-[#F97316]" />
                <h2 className="text-base font-bold text-[#FAFAFA]">Synthèse & Recommandations</h2>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-[#FAFAFA] whitespace-pre-wrap">{synthesis}</div>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={endRef} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
