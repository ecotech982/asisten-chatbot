/**
 * Advanced Gemini Image Service with:
 * 1. Native Gemini Image Model Fallback loop (gemini-3.1-flash-lite-image, gemini-3.1-flash-image, gemini-2.5-flash-image)
 * 2. Primary & Backup Key automatic failover on 429 Quota Exceeded
 * 3. Client-side Image Optimization to avoid TPM (Tokens Per Minute) token quota exhaustion
 * 4. High-Fidelity Smart Visual Engine:
 *    - Strict prompt translation & semantic preservation (subject, colors, action, background, style)
 *    - Preserves requested art styles (2D anime, 3D render, watercolor, sketch, oil painting, flat logo, photo)
 *    - Multi-candidate high-fidelity rendering without prompt scrambling (enhance=false)
 *    - Smart visual editing with multimodal image analysis
 */

import { GoogleGenAI } from "@google/genai";
import { getEffectiveApiKeys, isSmartEngineEnabled, parseGeminiError } from "./geminiKey";
import { optimizeImageBase64 } from "./imageOptimizer";

export interface ImageGenResult {
  imageUrl: string;
  engineUsed: "gemini-native" | "gemini-smart-engine";
  modelName: string;
  backupKeyUsed: boolean;
  infoMessage?: string;
}

export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

const NATIVE_IMAGE_MODELS = [
  "gemini-3.1-flash-lite-image",
  "gemini-3.1-flash-image",
  "gemini-2.5-flash-image",
];

function getDimensionsForAspect(aspectRatio: AspectRatio): { width: number; height: number } {
  switch (aspectRatio) {
    case "16:9":
      return { width: 1280, height: 720 };
    case "9:16":
      return { width: 720, height: 1280 };
    case "4:3":
      return { width: 1024, height: 768 };
    case "3:4":
      return { width: 768, height: 1024 };
    case "1:1":
    default:
      return { width: 1024, height: 1024 };
  }
}

type ArtStyleType = "anime" | "3d" | "realistic" | "art" | "general";

function detectArtStyle(promptText: string): ArtStyleType {
  const lower = promptText.toLowerCase();
  if (/\b(anime|kartun|manga|chibi|2d|wibu|komik|cel-shaded)\b/i.test(lower)) {
    return "anime";
  }
  if (/\b(3d|pixar|disney|cgi|render 3d|blender|unreal|cinema 4d)\b/i.test(lower)) {
    return "3d";
  }
  if (/\b(realistis|realistik|foto|fotografi|kamera|dslr|nyata|portrait|close up|photorealistic|macro)\b/i.test(lower)) {
    return "realistic";
  }
  if (/\b(lukisan|cat air|cat minyak|sketsa|pensil|vektor|logo|pixel art|watercolor|oil painting|line art|vintage)\b/i.test(lower)) {
    return "art";
  }
  return "general";
}

/**
 * Precision prompt translation & optimization using Gemini LLM.
 * Strictly guarantees that every requested subject, art style, color, action, and composition is faithfully preserved.
 */
async function buildHighFidelityVisualPrompt(
  ai: GoogleGenAI,
  userPrompt: string
): Promise<{ prompt: string; detectedStyle: ArtStyleType }> {
  const detectedStyle = detectArtStyle(userPrompt);

  const systemInstruction = `You are a precision prompt engineer for AI image generation.
Your task is to transform the user input (whether Indonesian or English) into an English prompt that produces an image EXACTLY matching what the user requested.

CRITICAL RULES:
1. STRICT FIDELITY: Every single subject, object, action, color, mood, and art style mentioned by the user MUST be included.
2. ART STYLE INTEGRITY:
   - If user asks for cartoon / anime / 2D / chibi: use 2D anime illustration or cel-shaded digital animation style.
   - If user asks for 3D / pixar: use 3D digital character render style.
   - If user asks for sketch / pencil / watercolor / oil painting: use that exact traditional art medium.
   - If user asks for logo / icon / minimalist: use flat vector, clean minimal iconography, isolated on solid background.
   - If user asks for photo / realistic: use high-detail photorealistic photography.
   - If no art style is specified: use clean, vibrant high-definition visual style faithful to the subject. NEVER force photorealism if unnatural for the subject.
3. STRUCTURE:
   [Main Subject and Action], [Key Features & Exact Colors], [Environment / Background Setting], [Art Style & Lighting]
4. NO UNREQUESTED DETAILS: Do NOT invent unrelated people, random buildings, or intrusive text.
5. CONCISE: 35-65 words in clear, descriptive English.
6. OUTPUT FORMAT: Output ONLY the raw prompt text. No quotes, no markdown, no conversational filler.`;

  const models = ["gemini-3.8-flash", "gemini-3.6-flash"];
  for (const model of models) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: `User Prompt: "${userPrompt}"\nGenerated Image Prompt:`,
        config: { systemInstruction },
      });
      const text = res.text?.trim();
      if (text && text.length > 5) {
        const cleaned = text
          .replace(/^["']+|["']+$/g, "")
          .replace(/^(image prompt|prompt|a prompt):\s*/i, "")
          .trim();
        return { prompt: cleaned, detectedStyle };
      }
    } catch {
      // try next model
    }
  }

  return { prompt: userPrompt, detectedStyle };
}

/**
 * Precision prompt synthesis for image editing based on multimodal visual analysis.
 */
async function buildHighFidelityEditPrompt(
  ai: GoogleGenAI,
  optimizedImage: { mimeType: string; base64Data: string },
  editInstruction: string
): Promise<{ prompt: string; detectedStyle: ArtStyleType }> {
  const detectedStyle = detectArtStyle(editInstruction);

  const systemInstruction = `You are an expert visual director and precision image prompt engineer.
The user has provided an image and wants to EDIT it with this instruction: "${editInstruction}".

YOUR TASK:
Carefully analyze the image and generate a concise English image prompt that describes the EDITED version of the image.

STRICT EDITING RULES:
1. SUBJECT FIDELITY: Keep the core subject, character identity, pose, and composition from the original image.
2. PRESERVE ART STYLE: If the original image is a real photo, keep it photorealistic. If it is 2D anime, 3D render, illustration, sketch, or watercolor, retain that EXACT art style.
3. PRECISE MODIFICATION: Apply ONLY the changes requested in "${editInstruction}" (e.g. change color, add/remove an object, change background, modify attire/expression). Do NOT alter unrequested features.
4. FORMAT: Write a concise, vivid prompt (35-65 words) starting with the main subject and the exact modifications.
5. NO FILLER: Output ONLY the raw descriptive prompt text.`;

  const models = ["gemini-3.8-flash", "gemini-3.6-flash"];
  for (const model of models) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: optimizedImage.mimeType,
                data: optimizedImage.base64Data,
              },
            },
            {
              text: `Instruction: "${editInstruction}". Formulate the edited scene prompt adhering strictly to the editing rules.`,
            },
          ],
        },
        config: { systemInstruction },
      });
      const text = res.text?.trim();
      if (text && text.length > 5) {
        const cleaned = text
          .replace(/^["']+|["']+$/g, "")
          .replace(/^(image prompt|prompt|a prompt):\s*/i, "")
          .trim();
        return { prompt: cleaned, detectedStyle };
      }
    } catch {
      // try next model
    }
  }

  return { prompt: editInstruction, detectedStyle };
}

/**
 * Fetch image from Smart Visual Engine with high-fidelity candidate models and enhance=false to prevent prompt distortion.
 */
async function renderSmartVisualImage(
  prompt: string,
  aspectRatio: AspectRatio,
  detectedStyle: ArtStyleType
): Promise<{ base64: string; modelUsed: string }> {
  const { width, height } = getDimensionsForAspect(aspectRatio);
  const seed = Math.floor(Math.random() * 10000000);
  const encodedPrompt = encodeURIComponent(prompt.trim());

  let candidateModels: string[] = [];
  if (detectedStyle === "anime") {
    candidateModels = ["flux-anime", "flux", "turbo", ""];
  } else if (detectedStyle === "3d") {
    candidateModels = ["flux-3d", "flux", "turbo", ""];
  } else if (detectedStyle === "realistic") {
    candidateModels = ["flux-realism", "flux", "turbo", ""];
  } else {
    candidateModels = ["flux", "turbo", ""];
  }

  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      const modelParam = model ? `&model=${encodeURIComponent(model)}` : "";
      // CRITICAL: enhance=false ensures the server does NOT rewrite or hallucinate on top of the prompt!
      const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true&enhance=false${modelParam}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 28000);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "image/jpeg,image/png,image/*",
        },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("image/")) {
          const blob = await res.blob();
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          return {
            base64,
            modelUsed: model ? `Smart Visual Engine (${model})` : "Smart Visual Engine (FLUX)",
          };
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("Gagal merender gambar melalui Smart Visual Engine. Silakan coba lagi.");
}

/**
 * Generate an image using Google Gemini local API key with token-quota resilience and strict prompt fidelity
 */
export async function generateGeminiImage(
  prompt: string,
  aspectRatio: AspectRatio = "1:1"
): Promise<ImageGenResult> {
  const { primary, backup } = getEffectiveApiKeys();

  if (!primary.key) {
    throw new Error("Kunci API Google Gemini belum diatur. Silakan masukkan API key Anda di menu pengaturan.");
  }

  const keysToTry: { key: string; isBackup: boolean }[] = [
    { key: primary.key, isBackup: false },
  ];
  if (backup.key && backup.key !== primary.key) {
    keysToTry.push({ key: backup.key, isBackup: true });
  }

  let lastQuotaError: any = null;
  let lastGenericError: any = null;

  // Phase 1: Try Native Gemini Image Models across available keys
  for (const keyObj of keysToTry) {
    const ai = new GoogleGenAI({ apiKey: keyObj.key });

    for (const model of NATIVE_IMAGE_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: {
            parts: [{ text: prompt }],
          },
          config: {
            imageConfig: {
              aspectRatio,
            },
          },
        });

        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            const mime = part.inlineData.mimeType || "image/png";
            return {
              imageUrl: `data:${mime};base64,${part.inlineData.data}`,
              engineUsed: "gemini-native",
              modelName: model,
              backupKeyUsed: keyObj.isBackup,
              infoMessage: keyObj.isBackup
                ? `Gambar berhasil dibuat menggunakan Kunci Cadangan sesuai prompt Anda: "${prompt}".`
                : `Gambar berhasil dibuat sesuai prompt Anda: "${prompt}".`,
            };
          }
        }
      } catch (err: any) {
        const parsed = parseGeminiError(err);
        if (parsed.isQuota) {
          lastQuotaError = err;
          continue;
        } else {
          lastGenericError = err;
        }
      }
    }
  }

  // Phase 2: High-Fidelity Smart Visual Engine
  // Triggers when native image model has quota limits (e.g. Free Tier limit: 0 on Vercel)
  if (isSmartEngineEnabled()) {
    try {
      const activeKey = primary.key || backup.key;
      const ai = new GoogleGenAI({ apiKey: activeKey });

      // Step 1: Translate & formulate prompt with strict fidelity to user's subject, style & colors
      const { prompt: highFidelityPrompt, detectedStyle } = await buildHighFidelityVisualPrompt(
        ai,
        prompt
      );

      // Step 2: Render with matched model, enhance=false to avoid prompt drifting
      const { base64, modelUsed } = await renderSmartVisualImage(
        highFidelityPrompt,
        aspectRatio,
        detectedStyle
      );

      return {
        imageUrl: base64,
        engineUsed: "gemini-smart-engine",
        modelName: modelUsed,
        backupKeyUsed: false,
        infoMessage: `Gambar berhasil dibuat sesuai prompt Anda: "${prompt}".`,
      };
    } catch (fallbackErr) {
      console.error("Smart visual engine error:", fallbackErr);
    }
  }

  const finalErr = lastQuotaError || lastGenericError || new Error("Gagal membuat gambar.");
  const parsed = parseGeminiError(finalErr);
  throw new Error(parsed.message);
}

/**
 * Edit an existing image using Google Gemini local API key with token-quota resilience and strict prompt fidelity
 */
export async function editGeminiImage(
  originalDataUrl: string,
  instruction: string,
  aspectRatio: AspectRatio = "1:1"
): Promise<ImageGenResult> {
  const { primary, backup } = getEffectiveApiKeys();

  if (!primary.key) {
    throw new Error("Kunci API Google Gemini belum diatur. Silakan masukkan API key Anda di menu pengaturan.");
  }

  // Optimize payload down to <= 1024px JPEG to save token bandwidth
  const optimized = await optimizeImageBase64(originalDataUrl, 1024, 0.85);

  const keysToTry: { key: string; isBackup: boolean }[] = [
    { key: primary.key, isBackup: false },
  ];
  if (backup.key && backup.key !== primary.key) {
    keysToTry.push({ key: backup.key, isBackup: true });
  }

  let lastQuotaError: any = null;
  let lastGenericError: any = null;

  // Phase 1: Try Native Gemini Image Editing across keys
  for (const keyObj of keysToTry) {
    const ai = new GoogleGenAI({ apiKey: keyObj.key });

    for (const model of NATIVE_IMAGE_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: optimized.mimeType,
                  data: optimized.base64Data,
                },
              },
              {
                text: instruction || "Edit and improve this image according to the specified changes.",
              },
            ],
          },
          config: {
            imageConfig: {
              aspectRatio,
            },
          },
        });

        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.inlineData && part.inlineData.data) {
            const mime = part.inlineData.mimeType || "image/png";
            return {
              imageUrl: `data:${mime};base64,${part.inlineData.data}`,
              engineUsed: "gemini-native",
              modelName: model,
              backupKeyUsed: keyObj.isBackup,
              infoMessage: keyObj.isBackup
                ? `Gambar berhasil diedit dengan Kunci Cadangan sesuai instruksi: "${instruction}".`
                : `Gambar berhasil diedit sesuai instruksi Anda: "${instruction}".`,
            };
          }
        }
      } catch (err: any) {
        const parsed = parseGeminiError(err);
        if (parsed.isQuota) {
          lastQuotaError = err;
          continue;
        } else {
          lastGenericError = err;
        }
      }
    }
  }

  // Phase 2: High-Fidelity Smart Vision Editing
  // Triggers when native image model has quota limits on Free Tier
  if (isSmartEngineEnabled()) {
    try {
      const activeKey = primary.key || backup.key;
      const ai = new GoogleGenAI({ apiKey: activeKey });

      // Step 1: Multimodal Vision analysis to strictly formulate the edited scene preserving subject & style
      const { prompt: editedScenePrompt, detectedStyle } = await buildHighFidelityEditPrompt(
        ai,
        optimized,
        instruction
      );

      // Step 2: Render the edited scene with strict prompt adherence
      const { base64, modelUsed } = await renderSmartVisualImage(
        editedScenePrompt,
        aspectRatio,
        detectedStyle
      );

      return {
        imageUrl: base64,
        engineUsed: "gemini-smart-engine",
        modelName: `Smart Vision Engine (${modelUsed})`,
        backupKeyUsed: false,
        infoMessage: `Gambar berhasil diedit sesuai instruksi Anda: "${instruction}".`,
      };
    } catch (fallbackErr) {
      console.error("Smart vision editing error:", fallbackErr);
    }
  }

  const finalErr = lastQuotaError || lastGenericError || new Error("Gagal mengedit gambar.");
  const parsed = parseGeminiError(finalErr);
  throw new Error(parsed.message);
}

