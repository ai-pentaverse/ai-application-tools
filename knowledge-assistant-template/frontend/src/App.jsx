import { useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import Header from "./components/Header.jsx";
import ChatCanvas from "./components/ChatCanvas.jsx";
import EvidencePanel from "./components/EvidencePanel.jsx";
import DocumentUpload from "./components/DocumentUpload.jsx";
import { useChat } from "./hooks/useChat.js";
import { mockConversations } from "./data/mockData.js";

export default function App() {
  const [conversations, setConversations] = useState(mockConversations);
  const [activeId, setActiveId] = useState(mockConversations[0]?.id ?? null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const {
    messages,
    isThinking,
    sendMessage,
    currentSources,
    activeSourceId,
    setActiveSourceId,
  } = useChat(activeId);

  const handleNewConversation = () => {
    const id = crypto.randomUUID();
    setConversations((prev) => [{ id, title: "New question" }, ...prev]);
    setActiveId(id);
  };

  const handleCiteClick = (sourceId) => {
    setActiveSourceId(sourceId);
    document.getElementById(`source-${sourceId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const activeTitle = conversations.find((c) => c.id === activeId)?.title ?? "New question";

  return (
    <div className="app-shell">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={handleNewConversation}
        onOpenUpload={() => setUploadOpen(true)}
      />

      <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
        <Header title={activeTitle} sourceCount={currentSources.length} />
        <ChatCanvas
          messages={messages}
          isThinking={isThinking}
          onSend={sendMessage}
          activeSourceId={activeSourceId}
          onCiteClick={handleCiteClick}
        />
      </div>

      <EvidencePanel
        sources={currentSources}
        activeSourceId={activeSourceId}
        onSelect={setActiveSourceId}
      />

      {uploadOpen && <DocumentUpload onClose={() => setUploadOpen(false)} />}
    </div>
  );
}
