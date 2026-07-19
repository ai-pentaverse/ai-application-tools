import { useRef, useState } from "react";
import { uploadDocument } from "../api/client.js";

export default function DocumentUpload({ onClose }) {
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = async (fileList) => {
    const incoming = Array.from(fileList).map((f) => ({
      name: f.name,
      status: "uploading",
    }));
    setFiles((prev) => [...prev, ...incoming]);

    for (const f of Array.from(fileList)) {
      try {
        await uploadDocument(f);
        setFiles((prev) =>
          prev.map((row) => (row.name === f.name ? { ...row, status: "indexed" } : row))
        );
      } catch {
        setFiles((prev) =>
          prev.map((row) => (row.name === f.name ? { ...row, status: "failed" } : row))
        );
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__title">Add documents</div>
        <div className="modal__subtitle">
          Upload files to ingest into the knowledge base. They'll be parsed, chunked, and embedded for retrieval.
        </div>

        <div
          className={`dropzone ${dragActive ? "dropzone--active" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
          }}
        >
          Drop files here, or click to browse
          <br />
          PDF, DOCX, TXT, MD, CSV
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => e.target.files?.length && handleFiles(e.target.files)}
          />
        </div>

        {files.map((f, i) => (
          <div className="file-row" key={i}>
            <span>{f.name}</span>
            <span className="file-row__status">
              {f.status === "uploading" ? "Indexing…" : f.status === "indexed" ? "Indexed" : "Failed"}
            </span>
          </div>
        ))}

        <div className="modal__actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
