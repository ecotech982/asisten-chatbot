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
  ImageIcon,
  Zap,
  Globe,
  RefreshCw,
} from "lucide-react";
import {
  getLocalApiKey,
  setLocalApiKey,
  removeLocalApiKey,
  getLocalBackupApiKey,
  setLocalBackupApiKey,
  removeLocalBackupApiKey,
  isSmartEngineEnabled,
  setSmartEngineEnabled,
  getEffectiveApiKey,
  maskApiKey,
  testGeminiApiKey,
  testGeminiImageKey,
} from "../services/geminiKey";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeyUpdated: () => void;
}

export default function ApiKeyModal({ isOpen, onClose, onKeyUpdated }: ApiKeyModalProps) {
  const [inputKey, setInputKey] = useState("");
  const [backupKey, setBackupKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showBackupKey, setShowBackupKey] = useState(false);
  const [smartEngine, setSmartEngine] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [isTestingImage, setIsTestingImage] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [activeInfo, setActiveInfo] = useState(getEffectiveApiKey());
  const [showVercelGuide, setShowVercelGuide] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setInputKey(getLocalApiKey());
      setBackupKey(getLocalBackupApiKey());
      setSmartEngine(isSmartEngineEnabled());
      setActiveInfo(getEffectiveApiKey());
      setTestResult(null);
      setSaveMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmedPrimary = inputKey.trim();
    const trimmedBackup = backupKey.trim();

    if (!trimmedPrimary) {
      removeLocalApiKey();
    } else {
      setLocalApiKey(trimmedPrimary);
    }

    if (!trimmedBackup) {
      removeLocalBackupApiKey();
    } else {
      setLocalBackupApiKey(trimmedBackup);
    }

    setSmartEngineEnabled(smartEngine);
    setActiveInfo(getEffectiveApiKey());
    setSaveMessage("Pengaturan API Key dan mesin visual berhasil disimpan!");
    onKeyUpdated();
    setTimeout(() => {
      setSaveMessage(null);
    }, 3000);
  };

  const handleRemove = () => {
    removeLocalApiKey();
    removeLocalBackupApiKey();
    setInputKey("");
    setBackupKey("");
    setTestResult(null);
    setSaveMessage("Semua Kunci API lokal telah dihapus.");
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

  const handleTestImage = async () => {
    const keyToTest = inputKey.trim() || activeInfo.key;
    if (!keyToTest) {
      setTestResult({
        success: false,
        message: "Masukkan API key terlebih dahulu untuk menguji fitur gambar.",
      });
      return;
    }
    setIsTestingImage(true);
    setTestResult(null);
    try {
      const res = await testGeminiImageKey(keyToTest);
      setTestResult(res);
    } finally {
      setIsTestingImage(false);
    }
  };

  const handlePaste = async (field: "primary" | "backup") => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        if (field === "primary") setInputKey(text.trim());
        else setBackupKey(text.trim());
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
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/60 to-indigo-50/40">
          <div className="flex items-center gap-2.5 text-slate-800">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base leading-tight">
                Pengaturan API Key Google Gemini
              </h3>
              <p className="text-xs text-slate-500">
                Kunci Lokal & Anti Batas Kuota Token untuk Vercel
              </p>
            </div>
          </div>
          <button
            id="close-api-key-modal-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-sm">
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
                    API Key Utama Lokal Aktif
                  </span>
                  Tersimpan di browser:{" "}
                  <code className="font-mono bg-emerald-100/80 px-1.5 py-0.5 rounded text-emerald-900">
                    {maskApiKey(activeInfo.key)}
                  </code>
                  {getLocalBackupApiKey() && (
                    <span className="block mt-1 text-emerald-700">
                      ✓ Kunci cadangan aktif:{" "}
                      <code className="font-mono bg-emerald-100/80 px-1 py-0.2 rounded text-[11px]">
                        {maskApiKey(getLocalBackupApiKey())}
                      </code>
                    </span>
                  )}
                </div>
              )}
              {activeInfo.source === "env" && (
                <div>
                  <span className="font-semibold block text-sm text-blue-800 mb-0.5">
                    API Key Sistem / Vercel Terdeteksi
                  </span>
                  Menggunakan kunci bawaan environment. Anda dapat memasukkan kunci lokal Anda di bawah agar memiliki kuota token mandiri.
                </div>
              )}
              {activeInfo.source === "none" && (
                <div>
                  <span className="font-semibold block text-sm text-amber-800 mb-0.5">
                    API Key Belum Diatur
                  </span>
                  Masukkan API key Google Gemini Anda di bawah ini agar percakapan teks dan pembuatan gambar berfungsi dengan optimal.
                </div>
              )}
            </div>
          </div>

          {/* Primary Key Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Kunci API Utama (Google Gemini)
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
                  onClick={() => handlePaste("primary")}
                  title="Tempel dari Clipboard"
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer"
                >
                  <Clipboard className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  id="toggle-show-key-btn"
                  onClick={() => setShowKey(!showKey)}
                  title={showKey ? "Sembunyikan Kunci" : "Tampilkan Kunci"}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Backup Key Input (Auto-failover on 429 quota) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                Kunci API Cadangan (Opsional - Auto-Failover)
              </label>
              <span className="text-[11px] text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-md">
                Anti Kuota Habis
              </span>
            </div>
            <div className="relative flex items-center">
              <input
                id="gemini-backup-key-input"
                type={showBackupKey ? "text" : "password"}
                value={backupKey}
                onChange={(e) => setBackupKey(e.target.value)}
                placeholder="AIzaSy... (kunci kedua jika kunci utama mencapai kuota)"
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 pr-20 text-slate-800 font-mono text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all placeholder:text-slate-400"
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handlePaste("backup")}
                  title="Tempel dari Clipboard"
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer"
                >
                  <Clipboard className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowBackupKey(!showBackupKey)}
                  title={showBackupKey ? "Sembunyikan Kunci" : "Tampilkan Kunci"}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer"
                >
                  {showBackupKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              Jika Kunci Utama mengalami batas kuota (429), aplikasi otomatis berpindah ke Kunci Cadangan.
            </p>
          </div>

          {/* Smart Visual Engine Toggle */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-800">
                <Zap className="w-4 h-4 text-amber-500" />
                Smart Visual Engine (Resilience Kuota Vercel)
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Secara otomatis mengompres payload gambar dan mengalihkan ke model visual cerdas jika Google AI Studio Free Tier mengembalikan batas kuota (Limit 0) pada model native.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                checked={smartEngine}
                onChange={(e) => setSmartEngine(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Feedback Messages */}
          {saveMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-medium flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {saveMessage}
            </div>
          )}

          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 animate-in fade-in ${
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
                <p className="font-semibold">{testResult.success ? "Uji Koneksi Berhasil" : "Hasil Uji Kunci"}</p>
                <p>{testResult.message}</p>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              id="save-api-key-btn"
              type="button"
              onClick={handleSave}
              className="flex-1 min-w-[130px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium py-2.5 px-4 rounded-xl shadow-sm transition-all text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Key className="w-4 h-4" />
              Simpan Pengaturan
            </button>

            <button
              id="test-api-key-btn"
              type="button"
              onClick={handleTest}
              disabled={isTesting || isTestingImage || (!inputKey && !activeInfo.key)}
              className="bg-slate-100 hover:bg-slate-200 active:bg-slate-300 disabled:opacity-50 text-slate-700 font-medium py-2.5 px-3.5 rounded-xl transition-all text-xs flex items-center gap-1.5 cursor-pointer"
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              ) : (
                <Sparkles className="w-4 h-4 text-blue-600" />
              )}
              Uji Teks
            </button>

            <button
              id="test-image-api-key-btn"
              type="button"
              onClick={handleTestImage}
              disabled={isTesting || isTestingImage || (!inputKey && !activeInfo.key)}
              className="bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 disabled:opacity-50 font-medium py-2.5 px-3.5 rounded-xl transition-all text-xs flex items-center gap-1.5 border border-indigo-200 cursor-pointer"
            >
              {isTestingImage ? (
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              ) : (
                <ImageIcon className="w-4 h-4 text-indigo-600" />
              )}
              Uji Gambar
            </button>

            {(getLocalApiKey() || getLocalBackupApiKey()) && (
              <button
                id="remove-api-key-btn"
                type="button"
                onClick={handleRemove}
                title="Hapus Kunci Lokal"
                className="p-2.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors text-xs flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Vercel Deployment Guide Accordion */}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowVercelGuide(!showVercelGuide)}
              className="w-full flex items-center justify-between text-xs font-semibold text-slate-700 hover:text-blue-600 py-1 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-blue-600" />
                Panduan Mengatasi Batas Kuota Token Saat Deploy di Vercel
              </span>
              <span className="text-slate-400">{showVercelGuide ? "▲" : "▼"}</span>
            </button>

            {showVercelGuide && (
              <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2 animate-in fade-in">
                <p>
                  <strong>Mengapa terjadi batas kuota token di Vercel?</strong>
                </p>
                <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-500 pl-1">
                  <li>
                    <strong>Free Tier Limit 0:</strong> Akun Google AI Studio gratis memiliki batas kuota 0 untuk model gambar native (<code>gemini-*-image</code>).
                  </li>
                  <li>
                    <strong>Solusi 1 (Otomatis):</strong> Aktifkan <em>Smart Visual Engine</em> di atas. Sistem akan menggunakan kecerdasan Gemini lokal Anda untuk merekayasa prompt visual dan merender gambar bebas batas kuota token.
                  </li>
                  <li>
                    <strong>Solusi 2 (Kunci Cadangan):</strong> Masukkan Kunci Cadangan dari akun Google kedua Anda pada kolom di atas untuk rotasi otomatis jika kunci utama habis.
                  </li>
                  <li>
                    <strong>Solusi 3 (Di Dashboard Vercel):</strong> Tambahkan variabel lingkungan <code>VITE_GEMINI_API_KEY</code> di <em>Project Settings &gt; Environment Variables</em> di Vercel.
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            id="done-api-key-modal-btn"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium rounded-xl text-xs transition-colors shadow-xs cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
