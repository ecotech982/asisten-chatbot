import React, { useState, useEffect } from "react";
import {
  Key,
  X,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
  Clipboard,
  Trash2,
  Sparkles,
  Loader2,
  ShieldCheck,
  HelpCircle,
} from "lucide-react";
import {
  getLocalApiKey,
  setLocalApiKey,
  removeLocalApiKey,
  getEffectiveApiKey,
  maskApiKey,
  testGeminiApiKey,
} from "../services/geminiKey";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyUpdated: () => void;
}

export default function ApiKeyModal({ isOpen, onClose, onKeyUpdated }: ApiKeyModalProps) {
  const [inputKey, setInputKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [activeInfo, setActiveInfo] = useState(getEffectiveApiKey());

  useEffect(() => {
    if (isOpen) {
      const currentLocal = getLocalApiKey();
      setInputKey(currentLocal);
      setActiveInfo(getEffectiveApiKey());
      setTestResult(null);
      setSaveMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = inputKey.trim();
    if (!trimmed) {
      removeLocalApiKey();
      setSaveMessage("Kunci lokal dihapus. Menggunakan konfigurasi bawaan.");
    } else {
      setLocalApiKey(trimmed);
      setSaveMessage("Kunci API lokal berhasil disimpan!");
    }
    setActiveInfo(getEffectiveApiKey());
    onKeyUpdated();
    setTimeout(() => {
      setSaveMessage(null);
    }, 3000);
  };

  const handleRemove = () => {
    removeLocalApiKey();
    setInputKey("");
    setTestResult(null);
    setSaveMessage("Kunci API lokal telah dihapus.");
    setActiveInfo(getEffectiveApiKey());
    onKeyUpdated();
  };

  const handleTest = async () => {
    const keyToTest = inputKey.trim() || activeInfo.key;
    if (!keyToTest) {
      setTestResult({
        success: false,
        message: "Masukkan API key terlebih dahulu untuk menguji koneksi.",
      });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testGeminiApiKey(keyToTest);
      setTestResult(res);
    } finally {
      setIsTesting(false);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputKey(text.trim());
      }
    } catch {
      // Clipboard access might be blocked by iframe/browser permissions
    }
  };

  return (
    <div
      id="api-key-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        id="api-key-modal-container"
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-indigo-50/30">
          <div className="flex items-center gap-2.5 text-slate-800">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base leading-tight">
                Pengaturan API Key Google Gemini
              </h3>
              <p className="text-xs text-slate-500">
                Gunakan kunci API lokal untuk akses mandiri & tanpa batas
              </p>
            </div>
          </div>
          <button
            id="close-api-key-modal-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* Status Alert */}
          <div
            id="api-key-status-banner"
            className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              activeInfo.source === "local"
                ? "bg-emerald-50/70 border-emerald-200 text-emerald-900"
                : activeInfo.source === "env"
                ? "bg-blue-50/70 border-blue-200 text-blue-900"
                : "bg-amber-50/70 border-amber-200 text-amber-900"
            }`}
          >
            {activeInfo.source === "local" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : activeInfo.source === "env" ? (
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-xs leading-relaxed">
              {activeInfo.source === "local" && (
                <div>
                  <span className="font-semibold block text-sm text-emerald-800 mb-0.5">
                    API Key Lokal Aktif
                  </span>
                  Menggunakan kunci yang tersimpan di browser:{" "}
                  <code className="font-mono bg-emerald-100/80 px-1.5 py-0.5 rounded text-emerald-900">
                    {maskApiKey(activeInfo.key)}
                  </code>
                </div>
              )}
              {activeInfo.source === "env" && (
                <div>
                  <span className="font-semibold block text-sm text-blue-800 mb-0.5">
                    API Key Sistem / Environment Terdeteksi
                  </span>
                  Menggunakan kunci bawaan lingkungan kerja. Anda dapat menimpa dengan memasukkan
                  kunci lokal di bawah ini.
                </div>
              )}
              {activeInfo.source === "none" && (
                <div>
                  <span className="font-semibold block text-sm text-amber-800 mb-0.5">
                    API Key Belum Diatur
                  </span>
                  Masukkan API key Google Gemini Anda agar fitur chat dan pembuatan gambar dapat
                  berfungsi dengan lancar.
                </div>
              )}
            </div>
          </div>

          {/* Form Input */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Kunci API Google Gemini (Local)
            </label>
            <div className="relative flex items-center">
              <input
                id="gemini-api-key-input"
                type={showKey ? "text" : "password"}
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 pr-20 text-slate-800 font-mono text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  id="paste-api-key-btn"
                  onClick={handlePaste}
                  title="Tempel dari Clipboard"
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md transition-colors"
                >
                  <Clipboard className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  id="toggle-show-key-btn"
                  onClick={() => setShowKey(!showKey)}
                  title={showKey ? "Sembunyikan Kunci" : "Tampilkan Kunci"}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md transition-colors"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <p className="text-[12px] text-slate-500 flex items-center gap-1 mt-1">
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
              Kunci disimpan secara privat di <code>localStorage</code> peramban Anda.
            </p>
          </div>

          {/* Feedback Messages */}
          {saveMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {saveMessage}
            </div>
          )}

          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${
                testResult.success
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-rose-50 border-rose-200 text-rose-900"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600" />
              )}
              <div className="space-y-1">
                <p className="font-semibold">{testResult.success ? "Uji Koneksi Berhasil" : "Uji Koneksi Gagal"}</p>
                <p>{testResult.message}</p>
                {!testResult.success && testResult.message.includes("403") && (
                  <p className="text-[11px] text-rose-700 bg-rose-100/60 p-2 rounded-lg mt-1.5 border border-rose-200">
                    💡 <strong>Tips Mengatasi 403:</strong> Buat kunci baru di{" "}
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-semibold text-rose-900 hover:text-blue-700"
                    >
                      Google AI Studio
                    </a>
                    . Pastikan kunci tidak memiliki pembatasan HTTP Referrer atau IP (Pilih &apos;Don&apos;t restrict key&apos;).
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              id="save-api-key-btn"
              type="button"
              onClick={handleSave}
              className="flex-1 min-w-[120px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium py-2.5 px-4 rounded-xl shadow-sm transition-all text-xs flex items-center justify-center gap-2"
            >
              <Key className="w-4 h-4" />
              Simpan Kunci Lokal
            </button>

            <button
              id="test-api-key-btn"
              type="button"
              onClick={handleTest}
              disabled={isTesting || (!inputKey && !activeInfo.key)}
              className="bg-slate-100 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-50 text-slate-700 font-medium py-2.5 px-3.5 rounded-xl transition-all text-xs flex items-center gap-1.5"
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              ) : (
                <Sparkles className="w-4 h-4 text-blue-600" />
              )}
              Uji Koneksi
            </button>

            {getLocalApiKey() && (
              <button
                id="remove-api-key-btn"
                type="button"
                onClick={handleRemove}
                title="Hapus Kunci Lokal"
                className="p-2.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors text-xs flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* How to get API Key */}
          <div className="pt-3 border-t border-slate-100">
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-slate-700">
                  Cara Mendapatkan API Key Gratis:
                </span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 hover:underline"
                >
                  Buka Google AI Studio
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <ol className="text-xs text-slate-500 space-y-1 list-decimal list-inside pl-1">
                <li>Buka Google AI Studio dan masuk dengan akun Google Anda.</li>
                <li>Klik tombol &quot;Get API key&quot; / &quot;Create API key&quot;.</li>
                <li>Salin kuncinya (diawali dengan <code>AIzaSy...</code>).</li>
                <li>Tempel di kolom di atas, lalu klik <strong>Simpan Kunci Lokal</strong>.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            id="done-api-key-modal-btn"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium rounded-xl text-xs transition-colors shadow-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
