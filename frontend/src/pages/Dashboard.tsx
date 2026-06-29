import { createClient } from "@/lib/client";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import type { User } from "@supabase/supabase-js";
import {
  getConversations,
  getConversation,
  deleteConversation,
  streamAsk,
  streamFollowUp,
  parseStreamedResponse,
  extractLiveAnswer,
  type Conversation,
} from "@/lib/api";
import { StreamingText } from "@/components/StreamingText";
import {
  Plus,
  ArrowUp,
  ExternalLink,
  LogOut,
  Loader2,
  Search,
  Trash2,
  Globe,
  Paperclip,
  Compass,
  Library,
  MessageSquarePlus,
  TerminalSquare,
  Menu,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";

import logoImg from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const supabase = createClient();

type MessageItem = {
  id: string;
  role: "user" | "assistant";
  content: string;
  answer?: string;
  sources?: string[];
  followUps?: string[];
  isStreaming?: boolean;
};

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState<User | null>(null);
  const [jwt, setJwt] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [homeQuery, setHomeQuery] = useState("");
  const [followUpQuery, setFollowUpQuery] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const followUpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      setUser(user);
      const { data: { session } } = await supabase.auth.getSession();
      setJwt(session?.access_token ?? null);
    }
    init();
  }, []);

  useEffect(() => {
    if (!jwt) return;
    getConversations(jwt).then(setConversations);
  }, [jwt]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleAsk(query: string) {
    if (!jwt || !query.trim() || isStreaming) return;

    const userMsgId = crypto.randomUUID();
    const asstMsgId = crypto.randomUUID();

    setHomeQuery("");
    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: "user", content: query },
      { id: asstMsgId, role: "assistant", content: "", isStreaming: true },
    ]);
    setIsStreaming(true);

    let raw = "";

    try {
      const { conversationId: newConvId } = await streamAsk(
        jwt,
        query,
        activeConvId ?? undefined,
        (chunk) => {
          raw += chunk;
          setMessages(prev =>
            prev.map(m => m.id === asstMsgId ? { ...m, content: raw } : m)
          );
        }
      );

      const parsed = parseStreamedResponse(raw);
      setMessages(prev =>
        prev.map(m =>
          m.id === asstMsgId
            ? { ...m, answer: parsed.answer, sources: parsed.sources, followUps: parsed.followUps, isStreaming: false }
            : m
        )
      );

      if (!activeConvId) {
        setActiveConvId(newConvId);
        setConversations(prev => [
          { id: newConvId, title: query.slice(0, 70), slug: "" },
          ...prev.filter(c => c.id !== newConvId),
        ]);
      }

      setTimeout(() => followUpRef.current?.focus(), 100);
    } catch (err) {
      console.error(err);
      setMessages(prev =>
        prev.map(m =>
          m.id === asstMsgId
            ? { ...m, content: "Something went wrong.", answer: "Something went wrong.", isStreaming: false }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }

  async function handleFollowUp(query: string) {
    if (!jwt || !activeConvId || !query.trim() || isStreaming) return;

    const userMsgId = crypto.randomUUID();
    const asstMsgId = crypto.randomUUID();

    setFollowUpQuery("");
    setMessages(prev => [
      ...prev,
      { id: userMsgId, role: "user", content: query },
      { id: asstMsgId, role: "assistant", content: "", isStreaming: true },
    ]);
    setIsStreaming(true);

    let raw = "";

    try {
      await streamFollowUp(jwt, activeConvId, query, (chunk) => {
        raw += chunk;
        setMessages(prev =>
          prev.map(m => m.id === asstMsgId ? { ...m, content: raw } : m)
        );
      });

      const parsed = parseStreamedResponse(raw);
      setMessages(prev =>
        prev.map(m =>
          m.id === asstMsgId
            ? { ...m, answer: parsed.answer, sources: parsed.sources, followUps: parsed.followUps, isStreaming: false }
            : m
        )
      );
    } catch (err) {
      console.error(err);
    } finally {
      setIsStreaming(false);
      setTimeout(() => followUpRef.current?.focus(), 100);
    }
  }

  async function handleLoadConversation(convId: string) {
    if (!jwt || convId === activeConvId) return;
    const conv = await getConversation(jwt, convId);
    if (!conv) return;

    setActiveConvId(convId);
    setMessages(
      conv.Message.map((m): MessageItem => {
        if (m.role === "User") {
          return { id: m.id, role: "user", content: m.content };
        }
        const parsed = parseStreamedResponse(m.content);
        return {
          id: m.id,
          role: "assistant",
          content: m.content,
          answer: parsed.answer,
          sources: parsed.sources,
          followUps: parsed.followUps,
          isStreaming: false,
        };
      })
    );
  }

  function handleNewSearch() {
    setActiveConvId(null);
    setMessages([]);
    setHomeQuery("");
    setFollowUpQuery("");
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate("/auth");
  }

  async function handleDeleteConversation(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!jwt) return;

    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) {
      handleNewSearch();
    }

    const success = await deleteConversation(jwt, id);
    if (!success) {
      getConversations(jwt).then(setConversations);
    }
  }

  const isHome = messages.length === 0;

  const getFormattedDate = () => {
    const d = new Date();
    return d.toLocaleDateString("en-US", {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }).toUpperCase();
  };

  return (
    <div className="flex h-screen w-full bg-[#0D0D0D] text-white font-sans overflow-hidden selection:bg-white/20">
      
      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      <aside
        className={`flex-shrink-0 flex flex-col bg-[#0D0D0D] transition-all duration-300 ease-in-out overflow-hidden border-r absolute inset-y-0 left-0 z-50 md:relative ${
          isMobileMenuOpen 
            ? "translate-x-0 w-[260px] border-[#222] opacity-100" 
            : isSidebarOpen
              ? "-translate-x-full md:translate-x-0 w-[260px] border-[#222] opacity-100"
              : "-translate-x-full md:translate-x-0 w-0 border-transparent opacity-0"
        }`}
      >
        <div className="w-[260px] flex flex-col h-full shrink-0">
          <div className="p-4 pb-2">
            <div className="flex items-center gap-2.5 mb-6 px-2">
              <img src={logoImg} alt="Cortana" className="w-6 h-6 rounded-md object-cover grayscale" />
              <span className="font-semibold text-lg tracking-tight">cortana.</span>
              <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(false)} className="ml-auto md:hidden w-6 h-6 p-0 text-[#888] hover:text-[#E8E8E8]">
                 ✕
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(false)} className="ml-auto hidden md:flex items-center justify-center w-6 h-6 border border-[#333] rounded text-[#888] hover:text-[#E8E8E8] hover:bg-[#1A1A1A] p-0">
                <PanelLeftClose className="size-3.5" />
              </Button>
            </div>

          <Button
            onClick={handleNewSearch}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-full border border-[#333] bg-transparent hover:bg-[#1A1A1A] text-white text-sm h-auto font-medium"
          >
            <div className="flex items-center gap-2">
              <Plus className="size-4" />
              New thread
            </div>
            <div className="flex items-center justify-center bg-[#222] rounded px-1.5 py-0.5 text-[10px] text-[#888]">
              ⌘K
            </div>
          </Button>
        </div>

        <nav className="flex flex-col gap-1 px-3 py-4">
          <Button variant="ghost" onClick={handleNewSearch} className="justify-start gap-3 h-9 px-3 text-[#E8E8E8] hover:bg-[#1A1A1A] hover:text-white text-sm font-medium">
            <Search className="size-4 text-[#888]" />
            Ask
          </Button>
        </nav>

        <div className="flex-1 overflow-y-auto px-4 py-2 mt-4">
          <p className="text-[10px] font-semibold text-[#555] uppercase tracking-[0.15em] px-2 mb-3">
            History
          </p>
          <div className="flex flex-col gap-0.5">
            <div className="px-2 mb-2">
              <div className="relative group">
                <Search className="absolute left-0 top-1/2 -translate-y-1/2 size-3 text-[#555]" />
                <input type="text" placeholder="Search threads" className="w-full bg-transparent border-0 text-xs text-[#E8E8E8] placeholder:text-[#555] outline-none pl-5 py-1" />
              </div>
            </div>
            
            {conversations.map(conv => (
              <div key={conv.id} className="relative group">
                <Button
                  variant="ghost"
                  onClick={() => handleLoadConversation(conv.id)}
                  className={`w-full justify-start text-left px-2 py-1.5 h-auto rounded-md text-[13px] truncate ${
                    activeConvId === conv.id
                      ? "bg-[#1A1A1A] text-white font-medium"
                      : "text-[#888] hover:bg-[#111] hover:text-[#E8E8E8]"
                  }`}
                >
                  <span className="truncate">{conv.title ?? conv.slug ?? "Untitled"}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => handleDeleteConversation(e, conv.id)}
                  className="absolute right-0 top-1/2 -translate-y-1/2 h-6 w-6 text-[#555] hover:text-[#E8E8E8] opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-[#222]"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
            {conversations.length === 0 && jwt && (
              <p className="text-xs text-[#555] px-2 italic mt-2">Your threads will appear here.</p>
            )}
          </div>
        </div>

        {user && (
          <div className="p-4 mt-auto">
            <Button
              variant="ghost"
              onClick={handleSignOut}
              className="w-full justify-start gap-3 h-10 px-3 text-[#888] hover:bg-[#1A1A1A] hover:text-white text-sm"
            >
              <div className="w-5 h-5 rounded bg-[#222] text-[#E8E8E8] flex items-center justify-center text-[10px] font-medium shrink-0">
                {user.email?.[0]?.toUpperCase() ?? "U"}
              </div>
              <span className="truncate flex-1 text-left">{user.email}</span>
              <LogOut className="size-3.5" />
            </Button>
          </div>
        )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-hidden w-full">
        <header className="h-12 flex items-center justify-between px-4 md:px-6 border-b border-[#222] shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 text-[#888] -ml-2 hover:bg-[#1A1A1A]" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu className="size-4" />
            </Button>
            {!isSidebarOpen && (
              <Button variant="ghost" size="icon" className="hidden md:flex h-8 w-8 text-[#888] -ml-2 hover:bg-[#1A1A1A]" onClick={() => setIsSidebarOpen(true)}>
                <PanelLeftOpen className="size-4" />
              </Button>
            )}
            <div className="flex items-center gap-2 text-[10px] font-medium text-[#888] tracking-widest uppercase">
              <div className="w-1.5 h-1.5 rounded-full bg-[#555]"></div>
              ONLINE <span className="text-[#444] mx-1">-</span> {getFormattedDate()}
            </div>
          </div>
          <div className="text-[10px] font-medium text-[#888] tracking-widest uppercase hidden sm:block">
            V.0.1 <span className="text-[#444] ml-2">BETA</span>
          </div>
        </header>

        {isHome ? (
          <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 relative">
            <div className="w-full max-w-[700px] flex flex-col items-center">
              
              <div className="flex items-center gap-2 text-[10px] font-semibold text-[#888] tracking-[0.15em] mb-6 uppercase">
                <Search className="size-3" />
                A QUIETER SEARCH
              </div>

              <h1 className="text-[36px] md:text-[48px] font-serif italic tracking-tight text-white mb-4">
                Ask anything.
              </h1>
              <p className="text-[#888] text-[14px] md:text-[15px] mb-8 md:mb-10 text-center max-w-[500px] leading-relaxed">
                Welcome back, {user?.email?.split('@')[0] || 'User'}. Cortana scours the open web, then writes you back — in full sentences, with every source receipt attached.
              </p>

              <div className="w-full relative mb-8 group">
                <div className="absolute inset-0 bg-[#1A1A1A] rounded-xl border border-[#333] transition-colors group-focus-within:border-[#555]"></div>
                <div className="relative flex flex-col p-3 min-h-[120px]">
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <Search className="size-4 text-[#888]" />
                    <input
                      id="home-search-input"
                      type="text"
                      value={homeQuery}
                      onChange={e => setHomeQuery(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleAsk(homeQuery)}
                      placeholder="What do you want to know?"
                      disabled={isStreaming}
                      autoFocus
                      className="flex-1 h-auto bg-transparent border-0 outline-none shadow-none focus-visible:ring-0 p-0 text-[16px] text-[#E8E8E8] placeholder:text-[#555] w-full"
                    />
                  </div>
                  
                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">

                    </div>
                    <div className="flex items-center gap-2 text-[#555]">
                      <Button
                        size="icon"
                        onClick={() => handleAsk(homeQuery)}
                        disabled={!homeQuery.trim() || isStreaming}
                        className="h-7 w-7 bg-[#E8E8E8] hover:bg-white text-black rounded-md shrink-0 transition-colors disabled:opacity-50 disabled:bg-[#333] disabled:text-[#888]"
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-medium tracking-wide pr-1">
                        <span className="border border-[#333] rounded px-1 text-[#888]">↵</span> to send
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-3 mb-10">
                <Button variant="outline" onClick={() => handleAsk("Explain transformers like I'm a physicist.")} className="h-auto p-4 justify-start items-start text-left bg-transparent border-[#333] hover:bg-[#1A1A1A] hover:border-[#444] rounded-xl flex gap-3 transition-colors">
                  <div className="text-[10px] font-bold text-[#888] tracking-widest uppercase mt-0.5 w-[50px] shrink-0">Learn</div>
                  <div className="text-[13px] text-[#E8E8E8] font-normal leading-snug whitespace-normal">Explain transformers like I'm a physicist.</div>
                </Button>
                <Button variant="outline" onClick={() => handleAsk("What's the state of fusion energy in 2026?")} className="h-auto p-4 justify-start items-start text-left bg-transparent border-[#333] hover:bg-[#1A1A1A] hover:border-[#444] rounded-xl flex gap-3 transition-colors">
                  <div className="text-[10px] font-bold text-[#888] tracking-widest uppercase mt-0.5 w-[50px] shrink-0">News</div>
                  <div className="text-[13px] text-[#E8E8E8] font-normal leading-snug whitespace-normal">What's the state of fusion energy in 2026?</div>
                </Button>
                <Button variant="outline" onClick={() => handleAsk("Compare React Server Components vs. Remix.")} className="h-auto p-4 justify-start items-start text-left bg-transparent border-[#333] hover:bg-[#1A1A1A] hover:border-[#444] rounded-xl flex gap-3 transition-colors">
                  <div className="text-[10px] font-bold text-[#888] tracking-widest uppercase mt-0.5 w-[50px] shrink-0">Code</div>
                  <div className="text-[13px] text-[#E8E8E8] font-normal leading-snug whitespace-normal">Compare React Server Components vs. Remix.</div>
                </Button>
                <Button variant="outline" onClick={() => handleAsk("A weekend itinerary for Lisbon, under €400.")} className="h-auto p-4 justify-start items-start text-left bg-transparent border-[#333] hover:bg-[#1A1A1A] hover:border-[#444] rounded-xl flex gap-3 transition-colors">
                  <div className="text-[10px] font-bold text-[#888] tracking-widest uppercase mt-0.5 w-[50px] shrink-0">Travel</div>
                  <div className="text-[13px] text-[#E8E8E8] font-normal leading-snug whitespace-normal">A weekend itinerary for Lisbon, under €400.</div>
                </Button>
              </div>

              <div className="text-[10px] font-semibold text-[#555] tracking-widest uppercase">
                POWERED BY <span className="text-[#888]">TAVILY</span> <span className="mx-1.5">·</span> <span className="text-[#888]">OPENAI</span> <span className="mx-1.5">·</span> <span className="text-[#888]">BUN</span>
              </div>

            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8">
              <div className="max-w-[760px] mx-auto flex flex-col gap-6 md:gap-8 pb-4">
                {messages.map(msg => (
                  <div key={msg.id} className="animate-[fade-in_0.3s_ease-out_forwards]">
                    {msg.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[90%] md:max-w-[80%] bg-[#1A1A1A] px-4 md:px-5 py-3 md:py-3.5 rounded-2xl rounded-br-sm text-[14px] md:text-[15px] leading-relaxed text-[#E8E8E8] border border-[#222]">
                          {msg.content}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-5">
                        <div className="flex gap-4">
                          <div className="w-8 h-8 rounded shrink-0 bg-[#1A1A1A] border border-[#333] flex items-center justify-center mt-1">
                            <img src={logoImg} alt="AI" className="w-5 h-5 grayscale opacity-80 object-cover" />
                          </div>
                          <div className="flex-1 bg-transparent text-[14px] md:text-[15px] leading-[1.75] text-[#E8E8E8] min-w-0">
                            {msg.isStreaming ? (
                              <div>
                                {extractLiveAnswer(msg.content) ? (
                                  <StreamingText text={extractLiveAnswer(msg.content)} isStreaming={true} />
                                ) : (
                                  <span className="flex items-center gap-2 text-[#888] mt-1.5">
                                    <Loader2 className="size-4 animate-spin" />
                                    Scouring the web...
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="prose prose-invert prose-p:leading-relaxed prose-pre:bg-[#111] prose-pre:border prose-pre:border-[#333] max-w-none">
                                <p className="whitespace-pre-wrap m-0">{msg.answer ?? msg.content}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        {!msg.isStreaming && msg.sources && msg.sources.length > 0 && (
                          <div className="ml-12 pl-1 animate-[fade-in_0.4s_ease-out_forwards]">
                            <div className="flex items-center gap-2 text-[11px] font-medium text-[#888] uppercase tracking-wider mb-3">
                              <Library className="size-3" /> Sources
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {msg.sources.slice(0, 4).map((url, i) => (
                                <a
                                  key={i}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-3 py-2 rounded bg-[#111] border border-[#222] text-[#888] hover:text-[#E8E8E8] hover:bg-[#1A1A1A] hover:border-[#333] transition-colors max-w-[200px] group"
                                >
                                  <div className="w-4 h-4 rounded bg-[#222] flex items-center justify-center shrink-0 text-[9px] group-hover:bg-[#333]">{i + 1}</div>
                                  <span className="truncate text-[13px]">{getDomain(url)}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {!msg.isStreaming && msg.followUps && msg.followUps.length > 0 && (
                          <div className="ml-12 pl-1 mt-2 animate-[fade-in_0.5s_ease-out_forwards]">
                            <div className="flex items-center gap-2 text-[11px] font-medium text-[#888] uppercase tracking-wider mb-3">
                              <MessageSquarePlus className="size-3" /> Related
                            </div>
                            <div className="flex flex-col gap-2">
                              {msg.followUps.map((q, i) => (
                                <Button
                                  key={i}
                                  variant="outline"
                                  onClick={() => handleFollowUp(q)}
                                  disabled={isStreaming}
                                  className="justify-start h-auto py-3 px-4 bg-transparent border-[#222] hover:bg-[#1A1A1A] hover:border-[#333] text-[#E8E8E8] text-[14px] font-normal whitespace-normal text-left group rounded-lg"
                                >
                                  <span className="text-[#555] mr-3 font-mono shrink-0">+</span>
                                  {q}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="p-4 bg-[#0D0D0D]">
              <div className="max-w-[760px] mx-auto relative group">
                <div className="absolute inset-0 bg-[#1A1A1A] rounded-xl border border-[#333] transition-colors group-focus-within:border-[#555]"></div>
                <div className="relative flex items-end p-2 pl-4">
                  <input
                    id="follow-up-input"
                    ref={followUpRef}
                    type="text"
                    value={followUpQuery}
                    onChange={e => setFollowUpQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleFollowUp(followUpQuery)}
                    placeholder="Ask a follow-up..."
                    disabled={isStreaming}
                    className="flex-1 h-[40px] bg-transparent border-0 outline-none shadow-none focus-visible:ring-0 p-0 text-[15px] text-[#E8E8E8] placeholder:text-[#555] mb-0.5 w-full"
                  />
                  <Button
                    size="icon"
                    onClick={() => handleFollowUp(followUpQuery)}
                    disabled={!followUpQuery.trim() || isStreaming}
                    className="h-8 w-8 bg-[#E8E8E8] hover:bg-white text-black rounded-md shrink-0 ml-2 disabled:opacity-50 disabled:bg-[#333] disabled:text-[#888]"
                  >
                    {isStreaming
                      ? <Loader2 className="size-4 animate-spin" />
                      : <ArrowUp className="size-4" />
                    }
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}