/**
 * Utility for managing the Google Gemini API key locally in the browser
 * and falling back to environment configuration.
 */

import { GoogleGenAI } from "@google/genai";

const STORAGE_KEY = "gemini_local_api_key";

export function getLocalApiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setLocalApiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    console.error("Gagal menyimpan API key ke localStorage:", e);
  }
}

export function removeLocalApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error("Gagal menghapus API key dari localStorage:", e);
  }
}

export function getEnvApiKey(): string {
  const envKey = process.env.GEMINI_API_KEY || (import.meta as any)?.env?.VITE_GEMINI_API_KEY || "";
  return envKey.trim();
}

export function getEffectiveApiKey(): { key: string; source: "local" | "env" | "none" } {
  const local = getLocalApiKey().trim();
  if (local) {
    return { key: local, source: "local" };
  }
  const env = getEnvApiKey().trim();
  if (env && env !== "MY_GEMINI_API_KEY") {
    return { key: env, source: "env" };
  }
  return { key: "", source: "none" };
}

export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 6)}••••••••${key.slice(-4)}`;
}

export function parseGeminiError(err: any): { 
  message: string; 
  isKeyProblem: boolean; 
  isPermissionDenied: boolean; 
  isQuota: boolean;
} {
  const rawMsg = err?.message || String(err || "");
  let statusCode = 0;
  let statusStr = "";
  let innerMsg = "";

  try {
    const parsed = JSON.parse(rawMsg);
    if (parsed.error) {
      statusCode = parsed.error.code || 0;
      statusStr = parsed.error.status || "";
      innerMsg = parsed.error.message || "";
    }
  } catch {
    // not JSON
  }

  const isPermissionDenied = statusCode === 403 || statusStr === "PERMISSION_DENIED" || rawMsg.includes("PERMISSION_DENIED");
  const isKeyInvalid = rawMsg.includes("API_KEY_INVALID") || rawMsg.includes("API key not valid") || rawMsg.includes("API_KEY");
  const isQuota = statusCode === 429 || statusStr === "RESOURCE_EXHAUSTED" || rawMsg.includes("RESOURCE_EXHAUSTED") || rawMsg.includes("quota");

  if (isPermissionDenied) {
    return {
      message: "Akses Ditolak (403 PERMISSION_DENIED). Kunci API tidak memiliki izin atau dibatasi. Pastikan Anda membuat API key di Google AI Studio (https://aistudio.google.com/apikey) tanpa pembatasan HTTP referrer/IP yang memblokir aplikasi ini.",
      isKeyProblem: true,
      isPermissionDenied: true,
      isQuota: false,
    };
  }

  if (isKeyInvalid && !isPermissionDenied) {
    return {
      message: "Kunci API tidak valid. Pastikan Anda menyalin seluruh karakter kunci (diawali dengan 'AIzaSy...').",
      isKeyProblem: true,
      isPermissionDenied: false,
      isQuota: false,
    };
  }

  if (isQuota) {
    return {
      message: "Batas kuota (Rate Limit/Quota) untuk API key ini telah habis. Silakan tunggu beberapa saat atau ganti dengan API key lain.",
      isKeyProblem: false,
      isPermissionDenied: false,
      isQuota: true,
    };
  }

  return {
    message: innerMsg || rawMsg || "Gagal menghubungkan ke Google Gemini API.",
    isKeyProblem: false,
    isPermissionDenied: false,
    isQuota: false,
  };
}

export async function testGeminiApiKey(apiKey: string): Promise<{ success: boolean; message: string }> {
  if (!apiKey.trim()) {
    return { success: false, message: "Kunci API tidak boleh kosong." };
  }
  try {
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    
    // Test with gemini-3.8-flash first (standard current model)
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: [{ role: "user", parts: [{ text: "Tes koneksi. Jawab: OK" }] }],
      });
      if (response.text) {
        return { success: true, message: "Koneksi Google Gemini API berhasil! Kunci aktif dan siap digunakan." };
      }
    } catch (primaryErr: any) {
      // Fallback test with gemini-3.6-flash
      const fallbackResponse = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [{ role: "user", parts: [{ text: "Tes koneksi. Jawab: OK" }] }],
      });
      if (fallbackResponse.text) {
        return { success: true, message: "Koneksi Google Gemini API berhasil (via Gemini 3.6 Flash)!" };
      }
    }
    
    return { success: true, message: "Kunci API valid dan siap digunakan." };
  } catch (err: any) {
    console.error("Error validasi API Key:", err);
    const parsed = parseGeminiError(err);
    return { success: false, message: parsed.message };
  }
}
