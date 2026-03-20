import React, { useState, useEffect, useRef } from 'react';
import { Settings, Send, Terminal, ShieldAlert, Cpu, Database, Globe, Lock, Code, Trash2, Info, Paperclip, X, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ProviderPreset = {
  id: string;
  name: string;
  endpoint: string;
  defaultModel: string;
  requiresKey: boolean;
};

type AttachedFile = {
  name: string;
  content: string;
};

const PRESETS: ProviderPreset[] = [
  { id: 'deepseek', name: 'DeepSeek (在线免费/低价)', endpoint: 'https://api.deepseek.com/v1/chat/completions', defaultModel: 'deepseek-chat', requiresKey: true },
  { id: 'qwen', name: 'Qwen 通义千问 (在线免费/低价)', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', defaultModel: 'qwen-plus', requiresKey: true },
  { id: 'ollama', name: 'Ollama (本地免费)', endpoint: 'http://localhost:11434/v1/chat/completions', defaultModel: 'qwen:7b', requiresKey: false },
  { id: 'custom', name: '自定义 (OpenAI 兼容)', endpoint: 'https://api.openai.com/v1/chat/completions', defaultModel: 'gpt-3.5-turbo', requiresKey: true },
];

const SYSTEM_PROMPT = `你是一个专业的CTF（Capture The Flag）竞赛助手和高级网络安全专家。
你的任务是帮助用户逐步分析CTF题目，提供切实可行的操作步骤、工具建议（如 nmap, sqlmap, burpsuite, pwntools, ghidra 等）和解题思路。
请遵循以下原则：
1. 逐步引导：不要直接给出最终Flag，而是给出下一步的分析方向和测试方法。
2. 实用主义：提供具体的命令、Payload或Python脚本（如pwntools代码）。
3. 严谨专业：解释漏洞原理（如SQL注入、反序列化、栈溢出等）。
4. 安全警告：提醒用户仅在授权的CTF环境或靶机中测试。`;

const QUICK_ACTIONS = [
  "🔍 分析这段代码的漏洞",
  "💻 编写 Pwntools 交互脚本",
  "🛡️ 提供 WAF 绕过思路",
  "📝 解释这个 Payload 的原理"
];

export default function App() {
  // --- State ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  
  // Settings State
  const [presetId, setPresetId] = useState<string>('deepseek');
  const [endpoint, setEndpoint] = useState(PRESETS[0].endpoint);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(PRESETS[0].defaultModel);
  const [systemPrompt, setSystemPrompt] = useState(SYSTEM_PROMPT);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('ctf-copilot-settings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      setPresetId(parsed.presetId || 'deepseek');
      setEndpoint(parsed.endpoint || PRESETS[0].endpoint);
      setApiKey(parsed.apiKey || '');
      setModel(parsed.model || PRESETS[0].defaultModel);
      setSystemPrompt(parsed.systemPrompt || SYSTEM_PROMPT);
    }
    
    // Load chat history
    const savedChat = localStorage.getItem('ctf-copilot-chat');
    if (savedChat) {
      setMessages(JSON.parse(savedChat));
    } else {
      setMessages([{ role: 'assistant', content: '你好，黑客。我是你的 CTF 竞赛助手。请告诉我你遇到了什么题目（Web, Pwn, Crypto, Reverse, Misc），或者粘贴题目描述和源码。' }]);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    localStorage.setItem('ctf-copilot-chat', JSON.stringify(messages));
  }, [messages]);

  // --- Handlers ---
  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pId = e.target.value;
    setPresetId(pId);
    const preset = PRESETS.find(p => p.id === pId);
    if (preset) {
      setEndpoint(preset.endpoint);
      setModel(preset.defaultModel);
      if (!preset.requiresKey) setApiKey('');
    }
  };

  const saveSettings = () => {
    localStorage.setItem('ctf-copilot-settings', JSON.stringify({ presetId, endpoint, apiKey, model, systemPrompt }));
    setIsSettingsOpen(false);
  };

  const clearChat = () => {
    if (window.confirm('确定要清空当前对话历史吗？')) {
      const initialMsg: Message = { role: 'assistant', content: '对话已清空。准备接受新任务。' };
      setMessages([initialMsg]);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      // Limit file size to 100KB to prevent context overflow
      if (file.size > 100 * 1024) {
        alert(`文件 ${file.name} 过大 (超过100KB)。请仅上传关键源码或日志片段。`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setAttachedFiles(prev => [...prev, { name: file.name, content }]);
      };
      reader.readAsText(file);
    });

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const sendMessage = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return;

    let finalInput = input;
    if (attachedFiles.length > 0) {
      const filesContext = attachedFiles.map(f => `\n\n[附件文件: ${f.name}]\n\`\`\`\n${f.content}\n\`\`\``).join('');
      finalInput += filesContext;
    }

    const userMsg: Message = { role: 'user', content: finalInput };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setAttachedFiles([]);
    setIsLoading(true);

    try {
      // Prepare payload (OpenAI compatible)
      const payloadMessages = [
        { role: 'system', content: systemPrompt },
        ...newMessages.map(m => ({ role: m.role, content: m.content }))
      ];

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model,
          messages: payloadMessages,
          stream: true, // We will handle streaming
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Error (${response.status}): ${errText}`);
      }

      if (!response.body) throw new Error('No response body');

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let assistantContent = '';

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6));
              const delta = data.choices[0]?.delta?.content || '';
              assistantContent += delta;
              
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].content = assistantContent;
                return updated;
              });
            } catch (e) {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error: any) {
      console.error(error);
      let errorMsg = error.message;
      if (errorMsg.includes('Failed to fetch') && presetId === 'ollama') {
        errorMsg = '无法连接到本地 Ollama。请确保 Ollama 正在运行，并且设置了环境变量 OLLAMA_ORIGINS="*" 以允许跨域请求。';
      }
      setMessages(prev => [...prev, { role: 'assistant', content: `**[系统错误]** 请求失败：\n\`\`\`text\n${errorMsg}\n\`\`\`` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // --- Render ---
  return (
    <div className="flex h-screen bg-zinc-950 text-emerald-500 font-mono overflow-hidden selection:bg-emerald-500/30">
      
      {/* Sidebar */}
      <div className="w-64 border-r border-emerald-900/50 bg-zinc-950/50 flex flex-col hidden md:flex">
        <div className="p-4 border-b border-emerald-900/50 flex items-center gap-3">
          <Terminal className="w-6 h-6 text-emerald-400" />
          <h1 className="text-lg font-bold tracking-wider text-emerald-400">CTF_COPILOT</h1>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <h2 className="text-xs text-emerald-700 uppercase tracking-widest mb-3 font-bold">Categories</h2>
            <ul className="space-y-2 text-sm text-emerald-600/80">
              <li className="flex items-center gap-2 hover:text-emerald-400 cursor-pointer transition-colors"><Globe className="w-4 h-4" /> Web Security</li>
              <li className="flex items-center gap-2 hover:text-emerald-400 cursor-pointer transition-colors"><Cpu className="w-4 h-4" /> Pwn / Exploit</li>
              <li className="flex items-center gap-2 hover:text-emerald-400 cursor-pointer transition-colors"><Lock className="w-4 h-4" /> Cryptography</li>
              <li className="flex items-center gap-2 hover:text-emerald-400 cursor-pointer transition-colors"><Code className="w-4 h-4" /> Reverse Eng</li>
              <li className="flex items-center gap-2 hover:text-emerald-400 cursor-pointer transition-colors"><Database className="w-4 h-4" /> Forensics/Misc</li>
            </ul>
          </div>

          <div className="p-3 bg-emerald-950/30 border border-emerald-900/50 rounded-lg">
            <h3 className="text-xs text-emerald-500 font-bold mb-2 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" /> Status
            </h3>
            <div className="text-xs text-emerald-600 space-y-1">
              <p>Model: <span className="text-emerald-400">{model}</span></p>
              <p>Provider: <span className="text-emerald-400">{PRESETS.find(p => p.id === presetId)?.name || 'Custom'}</span></p>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-emerald-900/50">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-full py-2 px-4 bg-emerald-950/50 hover:bg-emerald-900/50 border border-emerald-800/50 rounded text-sm transition-colors flex items-center justify-center gap-2"
          >
            <Settings className="w-4 h-4" /> Config API
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-zinc-950">
        
        {/* Mobile Header */}
        <div className="md:hidden p-4 border-b border-emerald-900/50 flex justify-between items-center bg-zinc-950/80 backdrop-blur">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-emerald-400">CTF_COPILOT</span>
          </div>
          <button onClick={() => setIsSettingsOpen(true)} className="p-2 text-emerald-600 hover:text-emerald-400">
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth">
          {messages.map((msg, idx) => (
            <div key={idx} className={cn("flex w-full", msg.role === 'user' ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[90%] md:max-w-[80%] rounded-lg p-4 border",
                msg.role === 'user' 
                  ? "bg-emerald-950/30 border-emerald-800/50 text-emerald-100" 
                  : "bg-zinc-900/50 border-zinc-800 text-zinc-300 shadow-[0_0_15px_rgba(0,0,0,0.5)]"
              )}>
                <div className="flex items-center gap-2 mb-2 opacity-50 text-xs uppercase tracking-wider">
                  {msg.role === 'user' ? <Terminal className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3 text-emerald-500" />}
                  {msg.role === 'user' ? 'root@kali:~#' : 'copilot@ai:~#'}
                </div>
                <div className="prose prose-invert prose-emerald max-w-none prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800 prose-code:text-emerald-400 text-sm md:text-base leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 md:p-6 bg-gradient-to-t from-zinc-950 to-transparent">
          <div className="max-w-4xl mx-auto space-y-3">
            
            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => setInput(prev => prev + (prev ? '\n' : '') + action)}
                  className="text-xs px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 hover:border-emerald-700/50 hover:text-emerald-400 rounded-full transition-colors flex items-center gap-1 text-zinc-400"
                >
                  {action}
                </button>
              ))}
            </div>

            {/* Attached Files Preview */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-emerald-950/50 border border-emerald-800/50 text-emerald-300 text-xs px-3 py-1.5 rounded-lg">
                    <Code className="w-3 h-3" />
                    <span className="truncate max-w-[150px]">{file.name}</span>
                    <button onClick={() => removeFile(idx)} className="hover:text-red-400 ml-1">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative flex items-end gap-2">
              <button 
                onClick={clearChat}
                title="Clear Chat"
                className="p-3 text-zinc-500 hover:text-red-400 transition-colors rounded-lg bg-zinc-900/50 border border-zinc-800 shrink-0"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              
              <div className="flex-1 relative bg-zinc-900/80 border border-emerald-900/50 rounded-lg focus-within:border-emerald-500/50 focus-within:shadow-[0_0_15px_rgba(16,185,129,0.1)] transition-all flex items-end">
                <div className="absolute left-4 top-3.5 text-emerald-600">
                  <span className="animate-pulse">$&gt;</span>
                </div>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入题目描述、源码或报错信息 (Shift+Enter 换行)..."
                  className="w-full bg-transparent text-emerald-100 placeholder-emerald-800/50 p-3 pl-10 min-h-[52px] max-h-64 outline-none resize-none scrollbar-thin"
                  rows={1}
                  style={{ height: 'auto' }}
                />
                
                {/* File Upload Button */}
                <input 
                  type="file" 
                  multiple 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  accept=".txt,.py,.c,.cpp,.php,.html,.js,.json,.md,.log"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload Source Code / Log File"
                  className="p-3 text-emerald-600 hover:text-emerald-400 transition-colors shrink-0"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
              </div>

              <button
                onClick={sendMessage}
                disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
                className="p-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 rounded-lg transition-colors font-bold flex items-center justify-center shrink-0"
              >
                {isLoading ? <div className="w-5 h-5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-emerald-900/50 rounded-xl w-full max-w-2xl shadow-[0_0_30px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/50">
              <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                <Settings className="w-5 h-5" /> API Configuration
              </h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-zinc-500 hover:text-zinc-300 text-2xl leading-none">&times;</button>
            </div>
            
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              
              {/* Preset Selection */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-400 uppercase tracking-wider font-bold">Provider Preset</label>
                <select 
                  value={presetId}
                  onChange={handlePresetChange}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-emerald-100 outline-none focus:border-emerald-500/50"
                >
                  {PRESETS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Endpoint */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-400 uppercase tracking-wider font-bold">API Endpoint</label>
                <input 
                  type="text" 
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-emerald-100 outline-none focus:border-emerald-500/50 font-mono text-sm"
                  placeholder="https://api.openai.com/v1/chat/completions"
                />
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-400 uppercase tracking-wider font-bold">API Key</label>
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-emerald-100 outline-none focus:border-emerald-500/50 font-mono text-sm"
                  placeholder={presetId === 'ollama' ? 'Ollama 本地调用通常不需要 Key' : 'sk-...'}
                />
              </div>

              {/* Model Name */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-400 uppercase tracking-wider font-bold">Model Name</label>
                <input 
                  type="text" 
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-emerald-100 outline-none focus:border-emerald-500/50 font-mono text-sm"
                  placeholder="e.g., deepseek-chat, qwen-plus, qwen:7b"
                />
              </div>

              {/* System Prompt */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-400 uppercase tracking-wider font-bold">System Prompt</label>
                <textarea 
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-emerald-100 outline-none focus:border-emerald-500/50 font-mono text-sm h-32 resize-y"
                />
              </div>

              {/* Ollama Help */}
              {presetId === 'ollama' && (
                <div className="p-4 bg-blue-950/30 border border-blue-900/50 rounded-lg flex gap-3 text-blue-200 text-sm">
                  <Info className="w-5 h-5 text-blue-400 shrink-0" />
                  <div>
                    <p className="font-bold mb-1">Ollama 本地调用提示</p>
                    <p>由于浏览器安全限制，网页直接调用 localhost 可能会被拦截 (CORS)。请在启动 Ollama 时设置环境变量允许跨域：</p>
                    <code className="block bg-blue-950/50 p-2 rounded mt-2 text-xs text-blue-300 font-mono">
                      # Windows (CMD)<br/>
                      set OLLAMA_ORIGINS="*"<br/>
                      ollama serve<br/><br/>
                      # Linux / macOS<br/>
                      OLLAMA_ORIGINS="*" ollama serve
                    </code>
                  </div>
                </div>
              )}

            </div>
            
            <div className="p-4 border-t border-zinc-800 bg-zinc-950/50 flex justify-end gap-3">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveSettings}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold rounded-lg transition-colors"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
