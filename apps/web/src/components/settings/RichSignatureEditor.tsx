"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Link2,
  ImagePlus,
  Type,
  Undo2,
  Palette,
  RemoveFormatting,
} from "lucide-react";

/**
 * RichSignatureEditor — WYSIWYG contentEditable editor for email signatures.
 *
 * Supports:
 * - Copy-paste from Outlook (preserves HTML + images)
 * - Clipboard image paste (converts to base64 data URI)
 * - Image drag-and-drop
 * - Image upload button
 * - Basic formatting toolbar (bold, italic, underline, link, color, clear)
 * - Returns HTML string via onChange
 */
interface RichSignatureEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

/* ── Toolbar button ── */
function ToolBtn({
  icon: Icon,
  title,
  onClick,
  active,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault(); // keep focus in editor
        onClick();
      }}
      className={`p-1.5 rounded transition-colors ${
        active
          ? "bg-[#F97316]/20 text-[#F97316]"
          : "text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#27272A]"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/* ── Helpers ── */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function sanitizeHtml(html: string): string {
  // Light cleanup: remove scripts, event handlers
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\s*on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\s*on\w+\s*=\s*'[^']*'/gi, "");
}

/* ── Max image dimension for pasted images ── */
const MAX_IMG_WIDTH = 600;

async function resizeImageIfNeeded(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= MAX_IMG_WIDTH) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement("canvas");
      const ratio = MAX_IMG_WIDTH / img.width;
      canvas.width = MAX_IMG_WIDTH;
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export default function RichSignatureEditor({
  value,
  onChange,
  placeholder = "Collez votre signature Outlook ici, ou créez-en une...",
}: RichSignatureEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isInternalUpdate = useRef(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  /* ── Sync external value → editor (only on first mount or external change) ── */
  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value;
      }
    }
    isInternalUpdate.current = false;
  }, [value]);

  /* ── Emit changes ── */
  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    isInternalUpdate.current = true;
    const html = editorRef.current.innerHTML;
    // Normalize empty content
    const isEmpty = html === "<br>" || html === "<div><br></div>" || html.trim() === "";
    onChange(isEmpty ? "" : html);
  }, [onChange]);

  /* ── execCommand wrapper ── */
  const exec = useCallback((cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    emitChange();
  }, [emitChange]);

  /* ── Handle paste — preserve HTML from Outlook, convert clipboard images ── */
  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const clipboard = e.clipboardData;

      // 1. If clipboard has files (images from screenshot/clipboard)
      if (clipboard.files.length > 0) {
        e.preventDefault();
        for (const file of Array.from(clipboard.files)) {
          if (file.type.startsWith("image/")) {
            const base64 = await fileToBase64(file);
            const resized = await resizeImageIfNeeded(base64);
            document.execCommand(
              "insertHTML",
              false,
              `<img src="${resized}" style="max-width:100%;height:auto;" />`
            );
          }
        }
        emitChange();
        return;
      }

      // 2. If clipboard has HTML (paste from Outlook, Word, etc.)
      const html = clipboard.getData("text/html");
      if (html) {
        e.preventDefault();
        const cleaned = sanitizeHtml(html);
        // Extract body content if it's a full document
        const bodyMatch = cleaned.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const content = bodyMatch ? bodyMatch[1] : cleaned;
        // Remove meta/link/style tags but keep inline styles
        const stripped = content
          .replace(/<meta[^>]*>/gi, "")
          .replace(/<link[^>]*>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<!--[\s\S]*?-->/g, "");
        document.execCommand("insertHTML", false, stripped);
        emitChange();
        return;
      }

      // 3. Plain text — let browser handle default (inserts as text)
      // We'll emit change after the default paste
      setTimeout(emitChange, 0);
    },
    [emitChange]
  );

  /* ── Handle drop — support image drag-and-drop ── */
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      const files = e.dataTransfer.files;
      if (files.length === 0) return;

      e.preventDefault();
      for (const file of Array.from(files)) {
        if (file.type.startsWith("image/")) {
          const base64 = await fileToBase64(file);
          const resized = await resizeImageIfNeeded(base64);
          // Focus editor and insert at drop position
          editorRef.current?.focus();
          document.execCommand(
            "insertHTML",
            false,
            `<img src="${resized}" style="max-width:100%;height:auto;" />`
          );
        }
      }
      emitChange();
    },
    [emitChange]
  );

  /* ── Image upload via file input ── */
  const handleImageUpload = useCallback(async () => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      editorRef.current?.focus();
      for (const file of Array.from(files)) {
        if (file.type.startsWith("image/")) {
          const base64 = await fileToBase64(file);
          const resized = await resizeImageIfNeeded(base64);
          document.execCommand(
            "insertHTML",
            false,
            `<img src="${resized}" style="max-width:100%;height:auto;" />`
          );
        }
      }
      emitChange();
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [emitChange]
  );

  /* ── Insert link ── */
  const handleLink = useCallback(() => {
    const url = prompt("URL du lien :", "https://");
    if (url) {
      exec("createLink", url);
    }
  }, [exec]);

  /* ── Color picker colors ── */
  const colors = [
    "#FAFAFA", "#A1A1AA", "#71717A", "#3F3F46",
    "#F97316", "#EF4444", "#22C55E", "#3B82F6",
    "#8B5CF6", "#EC4899", "#F59E0B", "#06B6D4",
  ];

  return (
    <div className="rounded-lg border border-[#3F3F46] bg-[#18181B] overflow-hidden">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#27272A] bg-[#111113] flex-wrap">
        <ToolBtn icon={Bold} title="Gras (Ctrl+B)" onClick={() => exec("bold")} />
        <ToolBtn icon={Italic} title="Italique (Ctrl+I)" onClick={() => exec("italic")} />
        <ToolBtn icon={Underline} title="Souligné (Ctrl+U)" onClick={() => exec("underline")} />

        <div className="w-px h-4 bg-[#27272A] mx-1" />

        <ToolBtn icon={Link2} title="Insérer un lien" onClick={handleLink} />
        <ToolBtn icon={ImagePlus} title="Insérer une image" onClick={handleImageUpload} />

        <div className="w-px h-4 bg-[#27272A] mx-1" />

        <div className="relative">
          <ToolBtn
            icon={Palette}
            title="Couleur du texte"
            onClick={() => setShowColorPicker(!showColorPicker)}
          />
          {showColorPicker && (
            <div className="absolute top-full left-0 mt-1 p-2 bg-[#18181B] border border-[#3F3F46] rounded-lg shadow-xl z-50 grid grid-cols-4 gap-1">
              {colors.map((color) => (
                <button
                  key={color}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    exec("foreColor", color);
                    setShowColorPicker(false);
                  }}
                  className="w-5 h-5 rounded border border-[#3F3F46] hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          )}
        </div>

        <ToolBtn icon={Type} title="Taille du texte" onClick={() => exec("fontSize", "3")} />

        <div className="w-px h-4 bg-[#27272A] mx-1" />

        <ToolBtn icon={RemoveFormatting} title="Supprimer le formatage" onClick={() => exec("removeFormat")} />
        <ToolBtn icon={Undo2} title="Annuler" onClick={() => exec("undo")} />
      </div>

      {/* ── Editor area ── */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emitChange}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        data-placeholder={placeholder}
        className="min-h-[140px] max-h-[400px] overflow-y-auto px-3.5 py-2.5 text-[13px] text-[#D4D4D8] focus:outline-none [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-[#52525B] [&:empty]:before:pointer-events-none [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded [&_a]:text-[#3B82F6] [&_a]:underline"
        style={{ wordBreak: "break-word" }}
      />

      {/* ── Hidden file input for image upload ── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* ── Help text ── */}
      <div className="px-3 py-1.5 border-t border-[#27272A] bg-[#111113]">
        <p className="text-[10px] text-[#52525B]">
          💡 Astuce : copiez votre signature depuis Outlook et collez-la ici directement (Ctrl+V). Les images et le formatage seront conservés.
        </p>
      </div>
    </div>
  );
}
