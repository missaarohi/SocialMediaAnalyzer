// client/src/utils/textExtraction.js
// import * as pdfjsLib from "pdfjs-dist";
import { createWorker } from "tesseract.js";

// PDF.js worker (browser-safe)
// pdfjsLib.GlobalWorkerOptions.workerSrc =
//   "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
// import * as pdfjsLib from "pdfjs-dist";
// pdfjsLib.GlobalWorkerOptions.workerSrc =
//   "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/* ---------------- PDF ---------------- */

export const extractPDFText = async (file, onProgress = () => {}) => {
  try {
    onProgress({ stage: "loading", progress: 5 });

    const buf = await file.arrayBuffer();
    onProgress({ stage: "parsing", progress: 15 });

    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

    let full = "";
    const total = pdf.numPages;

    for (let pg = 1; pg <= total; pg++) {
      const p = await pdf.getPage(pg);
      const tc = await p.getTextContent();
      const text = tc.items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim();
      if (text) full += text + "\n\n";

      const prog = 15 + (pg / total) * 70;
      onProgress({
        stage: "extracting",
        progress: Math.round(prog),
        currentPage: pg,
        totalPages: total,
      });
    }

    onProgress({ stage: "complete", progress: 100 });
    return full.trim();
  } catch (e) {
    throw new Error(`Failed to extract text from PDF: ${e.message}`);
  }
};

/* ---------------- OCR (images) ---------------- */

function blobToImage(blob) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(blob);
  });
}

async function preprocessImage(file) {
  const img = await blobToImage(file);
  const scale = Math.min(2.5, Math.max(1.5, 1200 / Math.min(img.width, img.height)));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let v = (g - 128) * 1.25 + 128; // contrast stretch
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  ctx.putImageData(imgData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png", 1);
  });
}

export const performOCR = async (file, onProgress = () => {}) => {
  let worker = null;
  try {
    onProgress({ stage: "initializing", progress: 5 });

    const pre = await preprocessImage(file);
    onProgress({ stage: "processing", progress: 20, detail: "Enhancing image…" });

    worker = await createWorker("eng", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          onProgress({
            stage: "recognizing",
            progress: Math.round(20 + m.progress * 75),
            detail: `Recognizing… ${Math.round(m.progress * 100)}%`,
          });
        }
      },
    });

    await worker.setParameters({
      tessedit_pageseg_mode: 6, // block of text
      preserve_interword_spaces: "1",
      user_defined_dpi: "300",
    });

    const { data } = await worker.recognize(pre);

    onProgress({ stage: "complete", progress: 100 });

    return data.text
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ") // drop non-printables
      .replace(/[^\S\r\n]+/g, " ")               // collapse spaces
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[•·◦]/g, "-")
      .trim();
  } catch (err) {
    throw new Error(`OCR failed: ${err.message}`);
  } finally {
    if (worker) await worker.terminate();
  }
};

/* ---------------- Validation + Orchestrator ---------------- */

export const validateFile = (file) => {
  const maxSize = 10 * 1024 * 1024;
  const allowed = {
    "application/pdf": "pdf",
    "image/jpeg": "image",
    "image/jpg": "image",
    "image/png": "image",
    "image/bmp": "image",
    "image/tiff": "image",
    "image/webp": "image",
  };

  if (!allowed[file.type]) {
    return { valid: false, error: "Unsupported file type. Upload PDF or image.", type: null };
  }
  if (file.size > maxSize) {
    return { valid: false, error: "File too large. Max 10MB.", type: null };
  }
  return { valid: true, error: null, type: allowed[file.type] };
};

export const processFiles = async (files, onProgress = () => {}) => {
  let combined = "";
  const total = files.length;

  for (let i = 0; i < total; i++) {
    const f = files[i];
    const v = validateFile(f);
    if (!v.valid) throw new Error(`File "${f.name}": ${v.error}`);

    onProgress({
      stage: "processing_file",
      currentFile: i + 1,
      totalFiles: total,
      fileName: f.name,
      progress: 0,
    });

    let text = "";

    if (v.type === "pdf") {
      text = await extractPDFText(f, (p) => {
        const overall = (i / total) * 100 + p.progress / total;
        onProgress({
          stage: "processing_file",
          currentFile: i + 1,
          totalFiles: total,
          fileName: f.name,
          fileStage: p.stage,
          progress: Math.round(overall),
          detail: p.currentPage ? `Page ${p.currentPage}/${p.totalPages}` : "",
        });
      });
    } else {
      text = await performOCR(f, (p) => {
        const overall = (i / total) * 100 + p.progress / total;
        onProgress({
          stage: "processing_file",
          currentFile: i + 1,
          totalFiles: total,
          fileName: f.name,
          fileStage: p.stage,
          progress: Math.round(overall),
          detail: p.detail || "",
        });
      });
    }

    if (text.trim()) {
      combined += `\n\n--- Content from ${f.name} ---\n${text}\n`;
    }
  }

  onProgress({ stage: "complete", progress: 100 });
  return combined.trim();
};
