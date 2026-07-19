import { useCallback, useState } from "react";
import { askQuestion } from "../api/client.js";

export function useChat(conversationId) {
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState(null);

  // Sources attached to the most recent assistant reply — this is what
  // the Evidence panel renders.
  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const currentSources = lastAssistantMsg?.sources ?? [];

  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim()) return;
      setMessages((prev) => [...prev, { role: "user", text }]);
      setIsThinking(true);
      setActiveSourceId(null);
      try {
        const answer = await askQuestion(conversationId, text);
        setMessages((prev) => [...prev, answer]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            text: "Something went wrong reaching the knowledge base. Please try again.",
            error: true,
            sources: [],
          },
        ]);
      } finally {
        setIsThinking(false);
      }
    },
    [conversationId]
  );

  return {
    messages,
    isThinking,
    sendMessage,
    currentSources,
    activeSourceId,
    setActiveSourceId,
  };
}
