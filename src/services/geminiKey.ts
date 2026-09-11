/**
 * Utility for managing the Google Gemini API key locally in the browser
 * and falling back to environment configuration.
 */

import { GoogleGenAI } from "@google/genai";

const STORAGE_KEY = "gemini_local_api_key";
const STORAGE_KEY_BACKUP = "gemini_local_api_key_backup";
const STORAGE_KEY_SMART_ENGINE = "gemini_smart_engine_enabled";

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

export function getLocalBackupApiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_BACKUP) || "";
  } catch {
    return "";
  }
}

export function setLocalBackupApiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY_BACKUP, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_BACKUP);
    }
  } catch (e) {
    console.error("Gagal menyimpan Backup API key ke localStorage:", e);
  }
}

export function removeLocalBackupApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_BACKUP);
  } catch (e) {
    console.error("Gagal menghapus Backup API key dari localStorage:", e);
  }
}

export function isSmartEngineEnabled(): boolean {
  try {
    const val = localStorage.getItem(STORAGE_KEY_SMART_ENGINE);
    return val === null ? true : val === "true";
  } catch {
    return true;
  }
}

export function setSmartEngineEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY_SMART_ENGINE, String(enabled));
  } catch (e) {
    console.error("Gagal menyimpan preferensi Smart Engine:", e);
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

export function getEffectiveApiKeys(): {
  primary: { key: string; source: "local" | "env" | "none" };
  backup: { key: string; source: "local" | "none" };
} {
  const primary = getEffectiveApiKey();
  const backupKey = getLocalBackupApiKey().trim();
  return {
    primary,
    backup: {
      key: backupKey,
      source: backupKey ? "local" : "none",
    },
  };
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
  isFreeTierZeroQuota: boolean;
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
  const isQuota = statusCode === 429 || statusStr === "RESOURCE_EXHAUSTED" || rawMsg.includes("RESOURCE_EXHAUSTED") || rawMsg.includes("quota") || rawMsg.includes("Quota exceeded");
  const isFreeTierZeroQuota = rawMsg.includes("limit: 0") || rawMsg.includes("FreeTier");

  if (isPermissionDenied) {
    return {
      message: "Akses Ditolak (403 PERMISSION_DENIED). Kunci API tidak memiliki izin atau dibatasi. Pastikan Anda membuat API key di Google AI Studio (https://aistudio.google.com/apikey) tanpa pembatasan HTTP referrer/IP yang memblokir domain Vercel Anda.",
      isKeyProblem: true,
      isPermissionDenied: true,
      isQuota: false,
      isFreeTierZeroQuota: false,
    };
  }

  if (isKeyInvalid && !isPermissionDenied) {
    return {
      message: "Kunci API tidak valid. Pastikan Anda menyalin seluruh karakter kunci Google Gemini (diawali dengan 'AIzaSy...').",
      isKeyProblem: true,
      isPermissionDenied: false,
      isQuota: false,
      isFreeTierZeroQuota: false,
    };
  }

  if (isQuota) {
    if (isFreeTierZeroQuota) {
      return {
        message: "Batas kuota model gambar native Google AI Studio Free Tier (Limit 0). Akun Google AI Studio gratis membatasi model visual. Smart Visual Engine lokal telah diaktifkan otomatis agar pembuatan dan pengeditan gambar Anda di Vercel tetap berhasil.",
        isKeyProblem: false,
        isPermissionDenied: false,
        isQuota: true,
        isFreeTierZeroQuota: true,
      };
    }
    return {
      message: "Batas kuota token / rate limit (429 RESOURCE_EXHAUSTED) tercapai. Anda dapat memasukkan kunci API Gemini cadangan di pengaturan atau mengaktifkan Smart Visual Engine agar bebas kendala batas kuota.",
      isKeyProblem: true,
      isPermissionDenied: false,
      isQuota: true,
      isFreeTierZeroQuota: false,
    };
  }

  return {
    message: innerMsg || rawMsg || "Gagal menghubungkan ke Google Gemini API.",
    isKeyProblem: false,
    isPermissionDenied: false,
    isQuota: false,
    isFreeTierZeroQuota: false,
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

export async function testGeminiImageKey(apiKey: string): Promise<{ success: boolean; message: string }> {
  if (!apiKey.trim()) {
    return { success: false, message: "Kunci API tidak boleh kosong." };
  }
  try {
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const models = ["gemini-3.1-flash-lite-image", "gemini-3.1-flash-image", "gemini-2.5-flash-image"];
    let lastErr: any = null;

    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: {
            parts: [{ text: "simple red icon" }]
          },
          config: {
            imageConfig: { aspectRatio: "1:1" }
          }
        });
        if (response.candidates?.[0]?.content?.parts) {
          return {
            success: true,
            message: `Fitur Image Creator & Editor aktif dan didukung oleh kunci Anda (Model: ${model})!`
          };
        }
      } catch (err: any) {
        lastErr = err;
      }
    }

    if (lastErr) {
      const parsed = parseGeminiError(lastErr);
      return { success: false, message: parsed.message };
    }
    return { success: true, message: "Fitur gambar siap digunakan." };
  } catch (err: any) {
    const parsed = parseGeminiError(err);
    return { success: false, message: parsed.message };
  }
}
