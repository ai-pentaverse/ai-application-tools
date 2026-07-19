// Thin API client. Every call points at /api/*, which vite.config.js proxies
// to the FastAPI backend (see /backend) during local development.
//
// DEMO_MODE lets the UI run and look complete with zero backend, using the
// fixtures in src/data/mockData.js. Flip it off (or set VITE_DEMO_MODE=false)
// once the backend is running.

import { mockAnswer, mockConversations } from "../data/mockData.js";

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== "false";
const BASE_URL = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${path} failed: ${res.status} ${body}`);
  }
  return res.json();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchConversations() {
  if (DEMO_MODE) {
    await delay(150);
    return mockConversations;
  }
  return request("/conversations");
}

// Sends a question to the assistant and returns a source-backed answer.
// Expected real-backend response shape (see backend/app/schemas.py):
// {
//   role: "assistant",
//   text: string,            // may contain [1], [2]... citation markers
//   confidence: number,      // 0..1
//   sources: [
//     { id, title, location, excerpt }
//   ]
// }
export async function askQuestion(conversationId, question) {
  if (DEMO_MODE) {
    await delay(900);
    return mockAnswer;
  }
  return request(`/conversations/${conversationId ?? "new"}/query`, {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

// Uploads a document for ingestion (parsing, chunking, embedding).
export async function uploadDocument(file, onProgress) {
  if (DEMO_MODE) {
    await delay(1200);
    onProgress?.(100);
    return { id: crypto.randomUUID(), name: file.name, status: "indexed" };
  }
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${BASE_URL}/documents`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export { DEMO_MODE };
