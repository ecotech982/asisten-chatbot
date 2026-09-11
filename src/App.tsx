/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { 
  MessageSquare, 
  Plus, 
  Send, 
  Image as ImageIcon, 
  Edit3, 
  Bot, 
  User, 
  Loader2, 
  X, 
  UploadCloud,
  Menu,
  Trash2,
  AlertCircle,
  Sparkles,
  Download,
  Key
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import ApiKeyModal from './components/ApiKeyModal';
import { getEffectiveApiKey, maskApiKey, parseGeminiError } from './services/geminiKey';
import { generateGeminiImage, editGeminiImage } from './services/geminiImageService';
import { optimizeImageBase64 } from './services/imageOptimizer';

// Extend window for AI Studio API Key selection
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const MODELS = [
  { id: 'text', name: 'Gemini 3.8 Flash', icon: MessageSquare, desc: 'Model teks mutakhir, cerdas & berkecepatan tinggi.' },
  { id: 'text-fast', name: 'Gemini 3.6 Flash', icon: Sparkles, desc: 'Model alternatif yang sangat stabil untuk percakapan.' },
  { id: 'image-gen', name: 'AI Image Creator', icon: ImageIcon, desc: 'Buat gambar kreatif dari deskripsi teks.' },
  { id: 'image-edit', name: 'AI Image Editor', icon: Edit3, desc: 'Edit atau ubah gambar dengan instruksi teks.' },
];

interface Message {
  id: string;
  role: 'user' | 'model';
  text?: string;
  imageUrl?: string;
  isError?: boolean;
  needsApiKey?: boolean;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

export default function App() {
  const [chats, setChats] = useState<Chat[]>([{ id: '1', title: 'Percakapan Baru', messages: [] }]);
  const [activeChatId, setActiveChatId] = useState('1');
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id);
  const [input, setInput] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<"1:1" | "16:9" | "9:16" | "4:3" | "3:4">("1:1");
  const [isTyping, setIsTyping] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [apiKeyInfo, setApiKeyInfo] = useState(getEffectiveApiKey());
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeChat = chats.find(c => c.id === activeChatId) || chats[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages, isTyping]);

  const handleKeyUpdated = () => {
    setApiKeyInfo(getEffectiveApiKey());
  };

  const handleNewChat = () => {
    const newId = Date.now().toString();
    setChats([{ id: newId, title: 'Percakapan Baru', messages: [] }, ...chats]);
    setActiveChatId(newId);
    setUploadedImage(null);
    setInput('');
  };

  const handleDeleteChat = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (chats.length <= 1) {
      handleNewChat();
      setChats(prev => prev.filter(c => c.id !== id));
    } else {
      const filtered = chats.filter(c => c.id !== id);
      setChats(filtered);
      if (activeChatId === id) setActiveChatId(filtered[0].id);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !uploadedImage) || isTyping) return;

    const currentInput = input.trim();
    const currentImg = uploadedImage;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: currentInput, imageUrl: currentImg || undefined };

    // Update chat with user message
    setChats(prev => prev.map(c => c.id === activeChatId ? { 
      ...c, 
      messages: [...c.messages, userMsg],
      title: c.title === 'Percakapan Baru' ? (currentInput.slice(0, 25) || 'Edit Gambar') : c.title
    } : c));

    setInput('');
    setUploadedImage(null);
    setIsTyping(true);

    const currentKeyInfo = getEffectiveApiKey();
    if (!currentKeyInfo.key) {
      setIsTyping(false);
      setIsApiKeyModalOpen(true);
      setChats(prev => prev.map(c => c.id === activeChatId ? { 
        ...c, 
        messages: [...c.messages, { 
          id: Date.now().toString(), 
          role: 'model', 
          text: '⚠️ **Kunci API Google Gemini Belum Diatur**\n\nUntuk memulai percakapan atau membuat gambar, silakan masukkan API Key Google Gemini Anda melalui jendela pengaturan yang terbuka.', 
          isError: true,
          needsApiKey: true
        }] 
      } : c));
      return;
    }

    try {
      // Use local or environment-provided GEMINI_API_KEY
      const ai = new GoogleGenAI({ apiKey: currentKeyInfo.key });
      let resultText = "";
      let resultImg = "";
      
      const systemInstruction = "Anda adalah AI Asisten yang profesional, sopan, dan rapi. Berikan jawaban dalam bahasa Indonesia yang baik dan benar. Hindari penggunaan simbol berlebihan seperti tanda bintang (*) jika tidak diperlukan untuk pemformatan yang sangat penting. Pastikan jawaban terstruktur dengan paragraf yang jelas.";

      if (selectedModel === 'text') {
        const textMessages = activeChat.messages
          .filter(m => !m.isError)
          .slice(-8)
          .map(m => ({
            role: m.role,
            parts: [{ text: m.text || "" }]
          }))
          .concat([{ role: 'user', parts: [{ text: currentInput || "Halo" }] }]);

        let response;
        try {
          response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: textMessages,
            config: {
              systemInstruction: systemInstruction
            }
          });
        } catch (modelErr: any) {
          console.warn("Gemini 3.8 Flash gagal, mencoba fallback ke Gemini 3.6 Flash:", modelErr);
          response = await ai.models.generateContent({
            model: "gemini-3.6-flash",
            contents: textMessages,
            config: {
              systemInstruction: systemInstruction
            }
          });
        }
        resultText = response.text || "Maaf, saya tidak dapat merespons saat ini.";

      } else if (selectedModel === 'text-fast' || selectedModel === 'text-pro') {
        const textMessages = activeChat.messages
          .filter(m => !m.isError)
          .slice(-8)
          .map(m => ({
            role: m.role,
            parts: [{ text: m.text || "" }]
          }))
          .concat([{ role: 'user', parts: [{ text: currentInput || "Halo" }] }]);

        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: textMessages,
          config: {
            systemInstruction: systemInstruction
          }
        });
        resultText = response.text || "Maaf, saya tidak dapat merespons saat ini.";

      } else if (selectedModel === 'image-gen') {
        if (!currentInput) throw new Error("Mohon masukkan deskripsi untuk membuat gambar.");
        
        // Multi-layer resilient image generation with quota failover & Smart Visual Engine
        const genResult = await generateGeminiImage(currentInput, aspectRatio);
        resultImg = genResult.imageUrl;
        resultText = genResult.infoMessage || "Berikut adalah gambar yang berhasil dibuat sesuai deskripsi Anda:";

      } else if (selectedModel === 'image-edit') {
        if (!currentImg) throw new Error("Mohon unggah gambar terlebih dahulu untuk diedit.");
        
        // Multi-layer resilient image editing with payload optimization & quota failover
        const editResult = await editGeminiImage(
          currentImg, 
          currentInput || "Tolong edit dan sempurnakan gambar ini", 
          aspectRatio
        );
        resultImg = editResult.imageUrl;
        resultText = editResult.infoMessage || "Gambar berhasil diproses dan diedit.";
      }

      // Save AI response
      setChats(prev => prev.map(c => c.id === activeChatId ? {
        ...c,
        messages: [...c.messages, { id: Date.now().toString(), role: 'model', text: resultText, imageUrl: resultImg || undefined }]
      } : c));

    } catch (err: any) {
      console.error("Gemini Error:", err);
      const parsed = parseGeminiError(err);
      
      setChats(prev => prev.map(c => c.id === activeChatId ? {
        ...c,
        messages: [...c.messages, { 
          id: Date.now().toString(), 
          role: 'model', 
          text: `**Terjadi Kendala:**\n\n${parsed.message}`, 
          isError: true,
          needsApiKey: parsed.isKeyProblem
        }]
      } : c));
    } finally {
      setIsTyping(false);
    }
  };

  const handleDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-800 font-sans">
      {/* Sidebar */}
      <aside className={`${isSidebarOpen ? 'w-72' : 'w-0'} bg-white border-r border-slate-200 flex flex-col transition-all duration-300 overflow-hidden relative shadow-lg z-20 shrink-0`}>
        <div className="p-5 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2 font-bold text-blue-600 text-lg">
            <Bot className="w-6 h-6" /> <span>AI Asisten</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1.5 hover:bg-slate-100 rounded-lg text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          <button onClick={handleNewChat} className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-4 rounded-xl font-medium shadow-sm transition-all active:scale-95">
            <Plus className="w-5 h-5" /> Percakapan Baru
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 space-y-1 pb-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2 mt-2">Riwayat</h2>
          {chats.map(chat => (
            <div key={chat.id} onClick={() => { setActiveChatId(chat.id); if (window.innerWidth < 768) setIsSidebarOpen(false); }} className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors group ${activeChatId === chat.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-100 text-slate-600'}`}>
              <div className="flex items-center gap-3 overflow-hidden">
                <MessageSquare className={`w-4 h-4 flex-shrink-0 ${activeChatId === chat.id ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="truncate text-sm font-medium">{chat.title}</span>
              </div>
              <button onClick={(e) => handleDeleteChat(e, chat.id)} className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-red-500 hover:bg-red-50 rounded-md transition-all">
                <Trash2 className="w-4 h-4"/>
              </button>
            </div>
          ))}
        </div>

        {/* Sidebar Footer - API Key Info */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50">
          <button
            id="sidebar-api-key-btn"
            onClick={() => setIsApiKeyModalOpen(true)}
            className="w-full flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 transition-colors text-left shadow-xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                apiKeyInfo.source === 'local' ? 'bg-emerald-500' : apiKeyInfo.source === 'env' ? 'bg-blue-500' : 'bg-amber-500 animate-pulse'
              }`} />
              <div className="truncate">
                <p className="text-xs font-semibold text-slate-700">API Key Gemini</p>
                <p className="text-[11px] text-slate-400 truncate">
                  {apiKeyInfo.source === 'local' 
                    ? `Lokal (${maskApiKey(apiKeyInfo.key)})` 
                    : apiKeyInfo.source === 'env' 
                    ? 'Sistem (.env)' 
                    : 'Belum diatur'}
                </p>
              </div>
            </div>
            <Key className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
        <header className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center px-4 md:px-6 sticky top-0 z-10 shadow-sm justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSidebarOpen(true)} className={`${isSidebarOpen ? 'hidden' : 'block'} p-2 mr-1 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors`}>
              <Menu className="w-5 h-5" />
            </button>
            
            <div className="relative flex items-center">
               <div className="absolute left-3 text-blue-600 pointer-events-none">
                 {React.createElement(MODELS.find(m => m.id === selectedModel)?.icon || Bot, { className: "w-4 h-4" })}
               </div>
               <select 
                 value={selectedModel} 
                 onChange={(e) => setSelectedModel(e.target.value)} 
                 className="bg-slate-100/80 hover:bg-slate-100 border border-slate-200 rounded-lg py-2 pl-9 pr-8 text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer appearance-none transition-all"
               >
                 {MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
               </select>
               <div className="absolute right-2.5 text-slate-500 pointer-events-none">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
               </div>
            </div>

            <span className="hidden lg:inline text-xs text-slate-500 font-medium tracking-wide bg-slate-100 px-3 py-1.5 rounded-md">
              {MODELS.find(m => m.id === selectedModel)?.desc}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="header-api-key-btn"
              onClick={() => setIsApiKeyModalOpen(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-xs ${
                apiKeyInfo.source === 'local'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : apiKeyInfo.source === 'env'
                  ? 'bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 ring-2 ring-amber-300/40'
              }`}
              title="Pengaturan API Key Gemini"
            >
              <Key className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">
                {apiKeyInfo.source === 'local' 
                  ? 'API Key Lokal' 
                  : apiKeyInfo.source === 'env' 
                  ? 'API Key Sistem' 
                  : 'Atur API Key'}
              </span>
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                apiKeyInfo.source === 'local' 
                  ? 'bg-emerald-500' 
                  : apiKeyInfo.source === 'env' 
                  ? 'bg-blue-500' 
                  : 'bg-amber-500 animate-pulse'
              }`} />
            </button>
          </div>
        </header>

        {/* Banner if no API key is set */}
        {apiKeyInfo.source === 'none' && (
          <div className="mx-4 md:mx-6 mt-4 p-3.5 bg-amber-50/90 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Key className="w-4 h-4" />
              </div>
              <div className="text-xs">
                <p className="font-semibold text-slate-800">Gunakan API Key Gemini Lokal</p>
                <p className="text-slate-600">Simpan API key Anda di browser ini untuk mengaktifkan AI percakapan dan pembuatan gambar.</p>
              </div>
            </div>
            <button
              onClick={() => setIsApiKeyModalOpen(true)}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-medium shadow-xs transition-colors shrink-0"
            >
              Atur API Key
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {activeChat.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-8">
              {selectedModel === 'image-gen' ? (
                <div className="space-y-4">
                  <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-md text-white">
                    <ImageIcon className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">AI Image Creator</h3>
                    <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto leading-relaxed">
                      Ditenagai model visual Google Gemini dengan kunci API Anda. Tuliskan deskripsi gambar yang ingin Anda buat di bawah.
                    </p>
                  </div>
                  <div className="pt-2 text-left space-y-2">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
                      Contoh Prompt Cepat:
                    </p>
                    <div className="grid gap-2">
                      {[
                        "Pemandangan sakura bermekaran di tepi danau dengan pantulan Gunung Fuji saat matahari terbit, lukisan cat air",
                        "Astronot kucing lucu melayang di orbit bumi mengenakan helm kaca bercahaya, 3D render hiperrealistis",
                        "Desain logo minimalis modern kepala serigala dengan gradasi biru elektrik dan latar belakang gelap"
                      ].map((promptText, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setInput(promptText)}
                          className="text-left text-xs bg-slate-50 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 text-slate-700 p-2.5 rounded-xl transition-colors cursor-pointer"
                        >
                          &ldquo;{promptText}&rdquo;
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : selectedModel === 'image-edit' ? (
                <div className="space-y-4">
                  <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-3xl flex items-center justify-center mx-auto shadow-md text-white">
                    <Edit3 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">AI Image Editor</h3>
                    <p className="text-slate-500 text-xs mt-1 max-w-sm mx-auto leading-relaxed">
                      Edit dan ubah gambar menggunakan AI Gemini dengan instruksi teks. Unggah gambar untuk memulai!
                    </p>
                  </div>

                  {!uploadedImage ? (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-2xl text-xs font-semibold shadow-sm transition-all cursor-pointer"
                    >
                      <UploadCloud className="w-4 h-4" />
                      Pilih Gambar untuk Diedit
                    </button>
                  ) : (
                    <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center justify-center gap-3">
                      <img src={uploadedImage} className="w-12 h-12 object-cover rounded-lg border border-indigo-200" alt="Preview" referrerPolicy="no-referrer" />
                      <div className="text-left text-xs">
                        <p className="font-semibold text-indigo-900">Gambar Terpasang</p>
                        <p className="text-indigo-700">Tulis instruksi perubahan pada kolom di bawah.</p>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 text-left space-y-2">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
                      Contoh Instruksi Edit:
                    </p>
                    <div className="grid gap-2">
                      {[
                        "Ubah latar belakang foto menjadi pemandangan matahari terbenam di pegunungan bersalju",
                        "Tambahkan kacamata hitam gaya retro dan topi fedora pada karakter di gambar",
                        "Ubah gaya visual gambar menjadi lukisan minyak impresionis warna-warni"
                      ].map((editInstruction, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setInput(editInstruction)}
                          className="text-left text-xs bg-slate-50 hover:bg-indigo-50/70 border border-slate-200 hover:border-indigo-300 text-slate-700 p-2.5 rounded-xl transition-colors cursor-pointer"
                        >
                          &ldquo;{editInstruction}&rdquo;
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 opacity-80">
                  <div className="w-16 h-16 bg-blue-100 rounded-3xl flex items-center justify-center mx-auto shadow-xs">
                    <Bot className="w-8 h-8 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800">Siap Membantu Anda</h3>
                  <p className="text-slate-500 text-xs leading-relaxed max-w-sm mx-auto">
                    Tanyakan apa saja, buat gambar visual baru, atau minta AI mengedit gambar menggunakan Google Gemini API.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6 pb-4">
              {activeChat.messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 md:gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  
                  {msg.role !== 'user' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                  )}
                  
                  <div className={`flex flex-col gap-2 max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {msg.imageUrl && (
                      <div className="flex flex-col gap-2">
                        <div className={`rounded-xl overflow-hidden shadow-sm border ${msg.role === 'user' ? 'border-blue-500' : 'border-slate-200'} bg-white group relative`}>
                          <img src={msg.imageUrl} className="max-w-full h-auto max-h-[350px] object-contain bg-slate-50" alt="Konten Visual" referrerPolicy="no-referrer" />
                          {msg.role === 'model' && (
                            <button 
                              onClick={() => handleDownload(msg.imageUrl!, `ai-asisten-${Date.now()}.png`)}
                              className="absolute top-2 right-2 p-2 bg-white/80 backdrop-blur-sm hover:bg-white text-blue-600 rounded-lg shadow-md opacity-0 group-hover:opacity-100 transition-all duration-200"
                              title="Download Gambar"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        {msg.role === 'model' && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <button 
                              onClick={() => handleDownload(msg.imageUrl!, `ai-asisten-${Date.now()}.png`)}
                              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors shadow-xs"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Unduh Gambar
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setUploadedImage(msg.imageUrl!);
                                setSelectedModel('image-edit');
                              }}
                              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors shadow-xs"
                              title="Kirim ke AI Image Editor untuk diedit lebih lanjut"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Edit di Image Editor
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    {msg.text && (
                      <div className={`px-4 py-3 rounded-2xl text-[15px] leading-relaxed shadow-sm ${
                        msg.role === 'user' 
                          ? 'bg-blue-600 text-white rounded-tr-sm' 
                          : msg.isError 
                            ? 'bg-red-50 text-red-600 border border-red-200 rounded-tl-sm' 
                            : 'bg-white text-slate-800 border border-slate-200 rounded-tl-sm'
                      }`}>
                        {msg.isError && (
                          <div className="flex items-center gap-2 mb-1.5 font-semibold text-xs text-red-700">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>Pemberitahuan Sistem</span>
                          </div>
                        )}
                        <div className={`markdown-content ${msg.role === 'user' ? 'text-white' : 'text-slate-800'}`}>
                          <ReactMarkdown>{msg.text}</ReactMarkdown>
                        </div>
                        {msg.needsApiKey && (
                          <button
                            type="button"
                            onClick={() => setIsApiKeyModalOpen(true)}
                            className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-medium shadow-xs transition-colors cursor-pointer"
                          >
                            <Key className="w-3.5 h-3.5" />
                            Atur API Key Sekarang
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mt-1 border border-slate-300">
                      <User className="w-4 h-4 text-slate-600" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {isTyping && (
            <div className="flex gap-4 max-w-4xl mx-auto justify-start">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center flex-shrink-0 shadow-sm mt-1">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white px-5 py-3.5 rounded-2xl rounded-tl-sm border border-slate-200 flex gap-3 items-center text-slate-500 text-sm shadow-sm">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> 
                <span className="font-medium text-xs md:text-sm">
                  {selectedModel === 'image-gen' 
                    ? 'Sedang merancang dan menghasilkan gambar sesuai prompt Anda...' 
                    : selectedModel === 'image-edit'
                      ? 'Sedang menganalisis visual dan mengedit gambar sesuai instruksi...'
                      : 'AI sedang berpikir dan mengetik respons...'}
                </span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-white border-t border-slate-200 p-3 md:p-5">
          <div className="max-w-4xl mx-auto relative">
            
            {uploadedImage && (
              <div className="absolute bottom-full mb-3 left-0 flex items-center gap-3 p-1.5 bg-white rounded-xl shadow-lg border border-slate-200 animate-in slide-in-from-bottom-2">
                <img src={uploadedImage} className="w-14 h-14 object-cover rounded-lg border border-slate-100" alt="Preview" referrerPolicy="no-referrer" />
                <div className="flex flex-col pr-2">
                  <span className="text-xs font-medium text-slate-600">Gambar disematkan</span>
                </div>
                <button onClick={() => setUploadedImage(null)} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg ml-auto transition-colors">
                  <X className="w-4 h-4"/>
                </button>
              </div>
            )}

            {/* Image Creator & Editor Controls Toolbar */}
            {selectedModel === 'image-gen' && (
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2 px-1 text-xs">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="font-semibold text-slate-700">Rasio:</span>
                  {(['1:1', '16:9', '9:16', '4:3', '3:4'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setAspectRatio(r)}
                      className={`px-2 py-0.5 rounded-md font-mono text-[11px] transition-all cursor-pointer ${
                        aspectRatio === r
                          ? 'bg-blue-600 text-white font-bold shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className={`inline-block w-2 h-2 rounded-full ${apiKeyInfo.source === 'local' ? 'bg-emerald-500' : apiKeyInfo.source === 'env' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                  <span className="text-slate-600">
                    {apiKeyInfo.source === 'local' 
                      ? `Kunci Lokal (${maskApiKey(apiKeyInfo.key)})` 
                      : apiKeyInfo.source === 'env' 
                        ? 'Kunci Sistem' 
                        : 'Belum Ada Kunci'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsApiKeyModalOpen(true)}
                    className="text-blue-600 hover:underline font-medium cursor-pointer"
                  >
                    {apiKeyInfo.source === 'local' ? 'Kelola' : 'Gunakan Kunci Lokal'}
                  </button>
                </div>
              </div>
            )}

            {selectedModel === 'image-edit' && (
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2 px-1 text-xs">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="font-medium">
                    {uploadedImage ? "✓ Gambar terpasang. Tulis instruksi edit di bawah." : "Unggah gambar terlebih dahulu dengan tombol ikon di bawah"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className={`inline-block w-2 h-2 rounded-full ${apiKeyInfo.source === 'local' ? 'bg-emerald-500' : apiKeyInfo.source === 'env' ? 'bg-blue-500' : 'bg-amber-500'}`} />
                  <span className="text-slate-600">
                    {apiKeyInfo.source === 'local' 
                      ? `Kunci Lokal (${maskApiKey(apiKeyInfo.key)})` 
                      : apiKeyInfo.source === 'env' 
                        ? 'Kunci Sistem' 
                        : 'Belum Ada Kunci'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsApiKeyModalOpen(true)}
                    className="text-blue-600 hover:underline font-medium cursor-pointer"
                  >
                    {apiKeyInfo.source === 'local' ? 'Kelola' : 'Gunakan Kunci Lokal'}
                  </button>
                </div>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="flex items-end gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-300 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-500 transition-all">
              
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()} 
                className={`p-3 rounded-xl flex-shrink-0 transition-colors ${selectedModel === 'text' ? 'text-slate-400 hover:bg-slate-200' : 'text-blue-600 hover:bg-blue-100 bg-blue-50'}`}
                title="Unggah Gambar"
              >
                <UploadCloud className="w-5 h-5"/>
              </button>
              
              <input 
                type="file" 
                hidden 
                ref={fileInputRef} 
                accept="image/*" 
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if(f) { 
                    const r = new FileReader(); 
                    r.onload = async (ev) => {
                      const rawData = ev.target?.result as string;
                      try {
                        const optimized = await optimizeImageBase64(rawData, 1024, 0.85);
                        setUploadedImage(optimized.optimizedUrl);
                      } catch {
                        setUploadedImage(rawData);
                      }
                      if (selectedModel === 'text') setSelectedModel('image-edit');
                    }; 
                    r.readAsDataURL(f); 
                  }
                }} 
              />
              
              <textarea 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSubmit(e))}
                placeholder={
                  selectedModel === 'image-gen' ? "Deskripsikan gambar yang ingin dibuat..." : 
                  selectedModel === 'image-edit' ? "Beri instruksi untuk mengedit gambar..." :
                  "Ketik pesan Anda di sini..."
                }
                className="flex-1 bg-transparent border-none focus:ring-0 py-3 px-2 text-[15px] resize-none max-h-32 text-slate-800 placeholder-slate-400" 
                rows={1}
                onInput={(e: any) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                }}
              />
              
              <button 
                type="submit" 
                disabled={isTyping || (!input.trim() && !uploadedImage)} 
                className="p-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                <Send className="w-5 h-5"/>
              </button>

            </form>
            <div className="text-center mt-2.5 text-[11px] font-medium text-slate-400">
              Sistem dapat mengalami kendala sesaat. Harap muat ulang percakapan jika terjadi kesalahan.
            </div>
          </div>
        </div>

      </main>

      <ApiKeyModal 
        isOpen={isApiKeyModalOpen} 
        onClose={() => setIsApiKeyModalOpen(false)} 
        onKeyUpdated={handleKeyUpdated} 
      />
    </div>
  );
}
