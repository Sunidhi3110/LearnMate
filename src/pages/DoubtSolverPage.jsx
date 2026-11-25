import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Sparkles,
  Send,
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  Code,
  Calculator,
  Atom,
  Cpu,
  AlertCircle,
  KeyRound,
  RotateCcw,
  PanelLeftClose,
  PanelLeftOpen,
  Copy,
  Loader2,
  BookOpen,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Camera,
  Upload,
  Eye,
  FileCheck
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MarkdownRenderer } from '../components/common/MarkdownRenderer';
import { CameraCaptureModal } from '../components/doubts/CameraCaptureModal';
import { processImageFile, processPdfFile } from '../lib/doubtAttachmentHelper';
import './DoubtSolverPage.css';

const SUBJECT_STARTERS = [
  {
    icon: Code,
    category: 'Computer Science',
    title: 'Algorithm Logic',
    prompt: 'Explain how binary search works step-by-step. Include clean Python code with time and space complexity analysis.'
  },
  {
    icon: Calculator,
    category: 'Mathematics',
    title: 'Calculus Derivative',
    prompt: 'How do I evaluate the derivative of f(x) = x^2 * sin(x) using the product rule? Please show each step clearly.'
  },
  {
    icon: Atom,
    category: 'Physics & Science',
    title: "Newton's Laws",
    prompt: "Explain Newton's third law of motion in simple terms with everyday examples and how action-reaction pairs work."
  },
  {
    icon: Cpu,
    category: 'Engineering',
    title: 'Circuit Analysis',
    prompt: "What is Kirchhoff's Voltage Law (KVL)? Walk me through how to formulate loop equations for a DC circuit."
  }
];

export const DoubtSolverPage = () => {
  const {
    aiConversations,
    activeAiConversationId,
    aiMessages,
    aiStatus,
    aiLoading,
    aiError,
    checkAiStatus,
    selectAiConversation,
    createAiConversation,
    renameAiConversation,
    deleteAiConversation,
    sendAiDoubt,
    conversationDocuments,
    clearConversationDocument
  } = useApp();

  const location = useLocation();
  const activeConversationDoc = (activeAiConversationId && conversationDocuments?.[activeAiConversationId]) || null;

  // Input & attachments state
  const [inputPrompt, setInputPrompt] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // UI state
  const [editingConvId, setEditingConvId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [attachedNoteTitle, setAttachedNoteTitle] = useState(location.state?.noteTitle || null);
  const [previewModalImage, setPreviewModalImage] = useState(null);

  // Refs
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const pdfInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const attachMenuRef = useRef(null);

  // Close attachment dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setShowAttachMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Read location state from navigation (e.g. from Notes "Ask Doubt Solver")
  useEffect(() => {
    if (location.state?.initialPrompt) {
      setInputPrompt(location.state.initialPrompt);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }
    if (location.state?.noteTitle) {
      setAttachedNoteTitle(location.state.noteTitle);
    }
  }, [location.state]);

  // Auto-scroll chat to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [aiMessages, aiLoading]);

  // Auto-focus input on page load or new chat
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [activeAiConversationId]);

  // Adjust textarea height automatically
  const handleInputChange = (e) => {
    setInputPrompt(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  };

  // Handle PDF file selection
  const handlePdfUpload = async (file) => {
    if (!file) return;
    setFileError(null);
    setIsProcessingFile(true);
    setShowAttachMenu(false);

    try {
      const processed = await processPdfFile(file);
      setAttachment(processed);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    } catch (err) {
      console.error('PDF error:', err);
      setFileError(err.message || 'Failed to process PDF document.');
    } finally {
      setIsProcessingFile(false);
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    }
  };

  // Handle Image file selection
  const handleImageUpload = async (file) => {
    if (!file) return;
    setFileError(null);
    setIsProcessingFile(true);
    setShowAttachMenu(false);

    try {
      const processed = await processImageFile(file);
      setAttachment(processed);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    } catch (err) {
      console.error('Image error:', err);
      setFileError(err.message || 'Failed to process image.');
    } finally {
      setIsProcessingFile(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // Handle camera capture callback
  const handleCameraCapture = (capturedData) => {
    setFileError(null);
    setAttachment(capturedData);
    setIsCameraModalOpen(false);
    setShowAttachMenu(false);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  // Drag and drop file handling
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      await handlePdfUpload(file);
    } else if (file.type.startsWith('image/')) {
      await handleImageUpload(file);
    } else {
      setFileError('Please drop an image (JPG, PNG, WEBP) or a PDF document.');
    }
  };

  // Remove current attachment
  const handleRemoveAttachment = () => {
    setAttachment(null);
    setFileError(null);
  };

  // Submit doubt handler
  const handleSend = async (customPrompt) => {
    let textToSend = typeof customPrompt === 'string' ? customPrompt : inputPrompt;

    if (!textToSend.trim() && !attachment && !activeConversationDoc) return;
    if (aiLoading || isProcessingFile) return;

    if (attachedNoteTitle && !textToSend.includes(attachedNoteTitle)) {
      textToSend = `[Context: From Note "${attachedNoteTitle}"]\n${textToSend}`;
    }

    const currentAttachment = attachment;

    // Reset input text & close attach dropdown
    setInputPrompt('');
    setFileError(null);
    setShowAttachMenu(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    const res = await sendAiDoubt(textToSend, currentAttachment);
    if (res?.success) {
      setAttachment(null);
    }
  };

  // Clear current active conversation
  const handleClearChat = () => {
    if (!activeAiConversationId) return;
    if (window.confirm('Clear all messages in this conversation thread?')) {
      deleteAiConversation(activeAiConversationId);
    }
  };

  // Keyboard shortcut: Enter to send, Shift+Enter for newline
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent?.isComposing) return;
      e.preventDefault();
      handleSend();
    }
  };

  // Rename conversation actions
  const startRename = (conv, e) => {
    e.stopPropagation();
    setEditingConvId(conv.id);
    setEditTitle(conv.title);
  };

  const saveRename = (convId, e) => {
    e.stopPropagation();
    if (editTitle.trim()) {
      renameAiConversation(convId, editTitle.trim());
    }
    setEditingConvId(null);
  };

  const cancelRename = (e) => {
    e.stopPropagation();
    setEditingConvId(null);
  };

  // Copy assistant response
  const handleCopyMessage = (msgId, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(msgId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div
      className={`doubt-solver-container ${isDragOver ? 'drag-active' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* =========================================================================
          LEFT SIDEBAR: Conversation History
         ========================================================================= */}
      <aside className={`doubt-history-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="doubt-sidebar-header">
          <div className="history-title-wrap">
            <MessageSquare size={18} className="history-icon" />
            <span className="history-title">Doubt History</span>
          </div>
          <button
            className="history-toggle-btn"
            onClick={() => setSidebarOpen(false)}
            title="Collapse history"
            aria-label="Collapse history"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        <div className="new-chat-btn-wrap">
          <button
            className="btn btn-primary new-chat-btn"
            onClick={() => {
              createAiConversation('New Doubt');
              setAttachment(null);
              setInputPrompt('');
            }}
            disabled={aiLoading}
          >
            <Plus size={18} />
            <span>New Doubt</span>
          </button>
        </div>

        <div className="doubt-conversations-list">
          {aiConversations.length === 0 ? (
            <div className="empty-history-notice">
              <p>No past doubts yet.</p>
              <span className="hint-text">Ask a question or upload a photo to start!</span>
            </div>
          ) : (
            aiConversations.map((conv) => {
              const isActive = conv.id === activeAiConversationId;
              const isEditing = editingConvId === conv.id;

              return (
                <div
                  key={conv.id}
                  className={`conversation-item ${isActive ? 'active' : ''}`}
                  onClick={() => selectAiConversation(conv.id)}
                >
                  <MessageSquare size={16} className="conv-icon" />

                  {isEditing ? (
                    <div className="conv-edit-box" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(conv.id, e);
                          if (e.key === 'Escape') cancelRename(e);
                        }}
                        autoFocus
                        className="conv-rename-input"
                      />
                      <button
                        className="conv-action-btn check"
                        onClick={(e) => saveRename(conv.id, e)}
                        title="Save title"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        className="conv-action-btn cancel"
                        onClick={cancelRename}
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="conv-title" title={conv.title}>
                        {conv.title}
                      </span>
                      <div className="conv-actions">
                        <button
                          className="conv-action-btn"
                          onClick={(e) => startRename(conv, e)}
                          title="Rename doubt"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="conv-action-btn delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Delete this conversation thread?')) {
                              deleteAiConversation(conv.id);
                            }
                          }}
                          title="Delete thread"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Sidebar Footer Info */}
        <div className="doubt-sidebar-footer">
          <div className="provider-status-badge">
            <span className={`status-dot ${aiStatus.isConfigured ? 'online' : 'warning'}`} />
            <span className="provider-text">
              {aiStatus.isConfigured ? `${aiStatus.model || 'Gemini 3.5 Flash-Lite'}` : 'Setup Required'}
            </span>
          </div>
          {!aiStatus.isConfigured && (
            <button
              className="setup-key-link"
              onClick={() => setShowConfigModal(true)}
              type="button"
            >
              <KeyRound size={13} /> Setup Edge Function
            </button>
          )}
        </div>
      </aside>

      {/* =========================================================================
          MAIN CHAT AREA
         ========================================================================= */}
      <main className="doubt-chat-main">
        {/* Chat Header */}
        <header className="doubt-chat-header">
          <div className="header-left">
            {!sidebarOpen && (
              <button
                className="expand-sidebar-btn"
                onClick={() => setSidebarOpen(true)}
                title="Open history sidebar"
                aria-label="Open history sidebar"
              >
                <PanelLeftOpen size={18} />
              </button>
            )}
            <div className="doubt-title-block">
              <div className="doubt-brand-icon">
                <Sparkles size={22} className="sparkle-anim" />
              </div>
              <div>
                <div className="page-category-tag">AI Doubt Solver</div>
                <h1 className="doubt-main-heading">Ask anything. Learn everything.</h1>
                <p className="doubt-sub-heading">
                  Your personal AI study assistant is here to help you understand difficult topics.
                </p>
              </div>
            </div>
          </div>

          <div className="header-right">
            {aiMessages.length > 0 && (
              <button
                className="btn btn-secondary btn-sm clear-chat-top-btn"
                onClick={handleClearChat}
                title="Clear current doubt thread"
                type="button"
              >
                <Trash2 size={15} /> Clear Chat
              </button>
            )}
            <button
              className="btn btn-primary btn-sm new-doubt-top-btn"
              onClick={() => {
                createAiConversation('New Doubt');
                setAttachment(null);
                setInputPrompt('');
              }}
              disabled={aiLoading}
              title="Start a fresh doubt thread"
              type="button"
            >
              <Plus size={16} /> New Chat
            </button>
          </div>
        </header>

        {/* Attached Note Context Banner */}
        {attachedNoteTitle && (
          <div className="attached-note-banner">
            <div className="attached-note-info">
              <BookOpen size={15} className="attached-note-icon" />
              <span>Studying with Note: <strong>{attachedNoteTitle}</strong></span>
            </div>
            <button
              type="button"
              className="remove-note-btn"
              onClick={() => setAttachedNoteTitle(null)}
              title="Detach note context"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Active Conversation Document Banner */}
        {activeConversationDoc && (
          <div className="active-conv-document-banner">
            <div className="doc-banner-info">
              <FileCheck size={16} className="doc-banner-icon" />
              <span>
                Active Document: <strong>{activeConversationDoc.fileName}</strong>
                {activeConversationDoc.pageCount ? ` (${activeConversationDoc.pageCount} pages)` : ''}
                {activeConversationDoc.formattedSize ? ` • ${activeConversationDoc.formattedSize}` : ''}
              </span>
              <span className="doc-status-badge">Loaded for study & follow-ups</span>
            </div>
            <button
              type="button"
              className="detach-doc-btn"
              onClick={() => {
                if (activeAiConversationId) clearConversationDocument(activeAiConversationId);
                setAttachment(null);
              }}
              title="Detach document from this chat"
            >
              <X size={14} /> Detach
            </button>
          </div>
        )}

        {/* Notice banner if Supabase Edge Function is not configured */}
        {!aiStatus.isConfigured && (
          <div className="api-config-banner">
            <div className="banner-content">
              <AlertCircle size={18} className="banner-icon" />
              <div>
                <strong>Supabase Edge Function Not Configured</strong>
                <p>
                  To receive real-time answers from Google Gemini, configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your <code>.env</code> file.
                </p>
              </div>
            </div>
            <button
              className="btn btn-outline btn-sm banner-action-btn"
              onClick={() => setShowConfigModal(true)}
            >
              View Setup Steps
            </button>
          </div>
        )}

        {/* Drag Over Overlay Hint */}
        {isDragOver && (
          <div className="drag-drop-overlay">
            <Upload size={48} className="drag-drop-icon" />
            <h3>Drop your PDF or image here</h3>
            <p>LearnMate AI will analyze the document and help solve your doubt</p>
          </div>
        )}

        {/* =======================================================================
            MESSAGES CANVAS
           ======================================================================= */}
        <div className="doubt-messages-canvas">
          {aiMessages.length === 0 ? (
            /* Empty State / Welcome Screen with 4 Multimodal Options & Starters */
            <div className="doubt-welcome-view">
              <div className="welcome-hero-card">
                <div className="hero-icon-ring">
                  <Sparkles size={34} />
                </div>
                <h2>What would you like to master today?</h2>
                <p>
                  Ask any question, attach textbook PDFs, upload question screenshots, or snap a photo of handwritten homework.
                  LearnMate breaks concepts down step-by-step with clear derivations, code, and intuitive logic.
                </p>

                {/* 4 Multimodal Ways to Ask */}
                <div className="multimodal-methods-grid">
                  <button
                    type="button"
                    className="method-card"
                    onClick={() => textareaRef.current?.focus()}
                  >
                    <div className="method-icon-badge text-badge">
                      <MessageSquare size={20} />
                    </div>
                    <div className="method-text">
                      <strong>1. Type Question</strong>
                      <span>Ask coding, formulas, or concepts</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="method-card"
                    onClick={() => pdfInputRef.current?.click()}
                  >
                    <div className="method-icon-badge pdf-badge">
                      <FileText size={20} />
                    </div>
                    <div className="method-text">
                      <strong>2. Upload PDF</strong>
                      <span>Lecture notes & question papers</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="method-card"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <div className="method-icon-badge image-badge">
                      <ImageIcon size={20} />
                    </div>
                    <div className="method-text">
                      <strong>3. Upload Photo</strong>
                      <span>Screenshots, diagrams & tables</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="method-card"
                    onClick={() => setIsCameraModalOpen(true)}
                  >
                    <div className="method-icon-badge camera-badge">
                      <Camera size={20} />
                    </div>
                    <div className="method-text">
                      <strong>4. Live Camera</strong>
                      <span>Snap textbook or paper problem</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Subject Quick Starters */}
              <div className="starters-section-heading">
                <span>Or explore common subjects:</span>
              </div>
              <div className="subject-starters-grid">
                {SUBJECT_STARTERS.map((s, idx) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={idx}
                      className="starter-card"
                      onClick={() => handleSend(s.prompt)}
                      disabled={aiLoading}
                      type="button"
                    >
                      <div className="starter-header">
                        <span className="starter-category">{s.category}</span>
                        <div className="starter-icon-wrap">
                          <Icon size={16} />
                        </div>
                      </div>
                      <h4 className="starter-title">{s.title}</h4>
                      <p className="starter-prompt">"{s.prompt}"</p>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Active Conversation Message List */
            <div className="messages-stream">
              {aiMessages.map((msg) => {
                const isUser = msg.role === 'user';
                const msgAtt = msg.attachment;

                return (
                  <div
                    key={msg.id}
                    className={`chat-message-row ${isUser ? 'user-row' : 'assistant-row'}`}
                  >
                    <div className="message-avatar">
                      {isUser ? (
                        <div className="avatar-user">You</div>
                      ) : (
                        <div className="avatar-ai">
                          <Sparkles size={16} />
                        </div>
                      )}
                    </div>

                    <div className="message-bubble-wrap">
                      <div className="message-sender-label">
                        <span>{isUser ? 'You' : 'LearnMate AI Tutor'}</span>
                        <span className="msg-time">
                          {msg.createdAt
                            ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : ''}
                        </span>
                      </div>

                      <div className={`message-bubble ${isUser ? 'user-bubble' : 'assistant-bubble'}`}>
                        {/* If user message has an attached document or photo */}
                        {isUser && msgAtt && (
                          <div className="user-message-attachment-box">
                            {msgAtt.isFollowUp ? (
                              <div className="chat-bubble-followup-pill">
                                <FileText size={12} />
                                <span>Grounded in: {msgAtt.fileName}</span>
                              </div>
                            ) : (
                              <>
                                {msgAtt.type === 'image' && msgAtt.previewUrl && (
                                  <div
                                    className="chat-bubble-image-thumb"
                                    onClick={() => setPreviewModalImage(msgAtt.previewUrl)}
                                    title="Click to enlarge"
                                  >
                                    <img src={msgAtt.previewUrl} alt={msgAtt.fileName || 'Attached photo'} />
                                    <div className="thumb-hover-overlay">
                                      <Eye size={16} />
                                    </div>
                                  </div>
                                )}

                                {msgAtt.type === 'pdf' && (
                                  <div className="chat-bubble-pdf-card">
                                    <div className="pdf-bubble-icon">
                                      <FileText size={22} />
                                    </div>
                                    <div className="pdf-bubble-meta">
                                      <span className="pdf-bubble-filename">{msgAtt.fileName || 'Document.pdf'}</span>
                                      <span className="pdf-bubble-sub">
                                        PDF {msgAtt.pageCount ? `• ${msgAtt.pageCount} page(s)` : ''} {msgAtt.formattedSize ? `• ${msgAtt.formattedSize}` : ''}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}

                        {isUser ? (
                          <p className="user-text-content">{msg.content}</p>
                        ) : (
                          <MarkdownRenderer content={msg.content} />
                        )}
                      </div>

                      {!isUser && (
                        <div className="bubble-footer-actions">
                          <button
                            className="copy-reply-btn"
                            onClick={() => handleCopyMessage(msg.id, msg.content)}
                            type="button"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check size={13} className="check-green" /> Copied explanation
                              </>
                            ) : (
                              <>
                                <Copy size={13} /> Copy response
                              </>
                            )}
                          </button>

                          <div className="followup-suggestions-row">
                            <span className="followup-label">Follow-up:</span>
                            <button
                              type="button"
                              className="followup-chip"
                              onClick={() => handleSend("Could you explain this with a simpler analogy and real-world example?")}
                              disabled={aiLoading}
                            >
                              💡 Simpler analogy
                            </button>
                            <button
                              type="button"
                              className="followup-chip"
                              onClick={() => handleSend("Can you provide a step-by-step calculation or code demonstration of this?")}
                              disabled={aiLoading}
                            >
                              📐 Step-by-step example
                            </button>
                            <button
                              type="button"
                              className="followup-chip"
                              onClick={() => handleSend("Generate a practice quiz question on this topic to test my understanding.")}
                              disabled={aiLoading}
                            >
                              📝 Practice question
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Loading / Thinking Indicator */}
              {aiLoading && (
                <div className="chat-message-row assistant-row loading-row">
                  <div className="message-avatar">
                    <div className="avatar-ai pulsing">
                      <Sparkles size={16} />
                    </div>
                  </div>
                  <div className="message-bubble-wrap">
                    <div className="message-bubble assistant-bubble loading-bubble">
                      <div className="thinking-dots">
                        <span className="dot" />
                        <span className="dot" />
                        <span className="dot" />
                      </div>
                      <span className="thinking-text">
                        LearnMate AI is analyzing the question and formulating a step-by-step solution...
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Notice */}
              {aiError && (
                <div className="chat-error-card">
                  <AlertCircle size={20} className="error-icon" />
                  <div className="error-body">
                    <strong>Request Unsuccessful</strong>
                    <p>{aiError}</p>
                    <div className="error-actions">
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          const lastUserMsg = [...aiMessages].reverse().find((m) => m.role === 'user');
                          if (lastUserMsg) {
                            sendAiDoubt(lastUserMsg.content, lastUserMsg.attachment);
                          }
                        }}
                      >
                        <RotateCcw size={14} /> Retry Last Question
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* =======================================================================
            BOTTOM CHAT INPUT BAR WITH MULTIMODAL ATTACHMENTS
           ======================================================================= */}
        <div className="doubt-input-wrapper">
          {/* File Processing Loader or Error Notice */}
          {isProcessingFile && (
            <div className="attachment-processing-bar">
              <Loader2 size={16} className="spinner-anim" />
              <span>Analyzing and reading document pages...</span>
            </div>
          )}

          {fileError && (
            <div className="attachment-error-bar">
              <AlertCircle size={16} />
              <span>{fileError}</span>
              <button type="button" onClick={() => setFileError(null)}>
                <X size={14} />
              </button>
            </div>
          )}

          {/* Active Attachment Preview Badge */}
          {attachment && !isProcessingFile && (
            <div className="active-attachment-preview-strip">
              <div className="attachment-badge-card">
                {attachment.type === 'image' ? (
                  <div className="thumb-container">
                    <img src={attachment.previewUrl} alt="Preview thumbnail" />
                  </div>
                ) : (
                  <div className="pdf-badge-icon">
                    <FileText size={18} />
                  </div>
                )}

                <div className="attachment-text-meta">
                  <span className="attachment-name" title={attachment.fileName}>
                    {attachment.fileName}
                  </span>
                  <span className="attachment-details">
                    {attachment.type === 'pdf'
                      ? `PDF • ${attachment.pageCount} page(s) • ${attachment.formattedSize}`
                      : `Photo • ${attachment.formattedSize}`}
                  </span>
                </div>

                <button
                  type="button"
                  className="remove-attachment-btn"
                  onClick={handleRemoveAttachment}
                  title="Remove attachment"
                  aria-label="Remove attachment"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Main Input Box Container */}
          <div className="input-box-container">
            {/* Multimodal Attachment Button & Dropdown */}
            <div className="attach-button-wrapper" ref={attachMenuRef}>
              <button
                type="button"
                className={`attach-toggle-btn ${showAttachMenu ? 'active' : ''}`}
                onClick={() => setShowAttachMenu((prev) => !prev)}
                title="Attach PDF, Photo, or take Camera photo"
                aria-label="Attachment options"
                disabled={aiLoading || isProcessingFile}
              >
                <Paperclip size={19} />
              </button>

              {showAttachMenu && (
                <div className="attach-dropdown-menu">
                  <button
                    type="button"
                    className="attach-menu-option"
                    onClick={() => {
                      setShowAttachMenu(false);
                      pdfInputRef.current?.click();
                    }}
                  >
                    <div className="menu-option-icon pdf-icon">
                      <FileText size={16} />
                    </div>
                    <div className="menu-option-info">
                      <strong>Upload PDF Document</strong>
                      <span>Notes, syllabus, or question papers</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="attach-menu-option"
                    onClick={() => {
                      setShowAttachMenu(false);
                      imageInputRef.current?.click();
                    }}
                  >
                    <div className="menu-option-icon image-icon">
                      <ImageIcon size={16} />
                    </div>
                    <div className="menu-option-info">
                      <strong>Upload Photo / Image</strong>
                      <span>Screenshots, diagrams, equations</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="attach-menu-option"
                    onClick={() => {
                      setShowAttachMenu(false);
                      setIsCameraModalOpen(true);
                    }}
                  >
                    <div className="menu-option-icon camera-icon">
                      <Camera size={16} />
                    </div>
                    <div className="menu-option-info">
                      <strong>Take Photo with Camera</strong>
                      <span>Snap textbook problem or handwriting</span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Hidden File Inputs */}
            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) handlePdfUpload(e.target.files[0]);
              }}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/jpg"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) handleImageUpload(e.target.files[0]);
              }}
            />

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              className="doubt-textarea"
              placeholder={
                attachment
                  ? `Ask a question about "${attachment.fileName}" or press Send to solve...`
                  : activeConversationDoc
                  ? `Ask anything about "${activeConversationDoc.fileName}" (e.g. 'Explain Module 1', 'Summarise', 'Create MCQs')...`
                  : "Ask any question... (e.g. 'Solve the integral of e^(2x) dx', or upload a photo/PDF)"
              }
              value={inputPrompt}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={aiLoading || isProcessingFile}
              maxLength={4000}
            />

            {/* Send Button */}
            <button
              className="send-doubt-btn"
              onClick={() => handleSend()}
              disabled={(!inputPrompt.trim() && !attachment && !activeConversationDoc) || aiLoading || isProcessingFile}
              title={aiLoading ? 'AI is thinking...' : 'Send question (Enter)'}
              aria-label="Send question"
              type="button"
            >
              {aiLoading ? (
                <Loader2 size={18} className="spinner-anim" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>

          <div className="input-helper-row">
            <span className="disclaimer-text">
              Multimodal AI Tutor • Supports Text, PDF documents, Photos, and Camera capture.
            </span>
            <span className="char-count">
              {inputPrompt.length > 0 && `${inputPrompt.length}/4000`}
            </span>
          </div>
        </div>
      </main>

      {/* =======================================================================
          CAMERA CAPTURE MODAL
         ======================================================================= */}
      <CameraCaptureModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={handleCameraCapture}
      />

      {/* =======================================================================
          ENLARGED IMAGE LIGHTBOX MODAL
         ======================================================================= */}
      {previewModalImage && (
        <div className="image-lightbox-backdrop" onClick={() => setPreviewModalImage(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="lightbox-close-btn"
              onClick={() => setPreviewModalImage(null)}
              aria-label="Close image preview"
            >
              <X size={20} />
            </button>
            <img src={previewModalImage} alt="Enlarged study problem" className="lightbox-img" />
          </div>
        </div>
      )}

      {/* =======================================================================
          CONFIGURATION MODAL (Guides user on Supabase Edge Function with Gemini)
         ======================================================================= */}
      {showConfigModal && (
        <div className="config-modal-backdrop" onClick={() => setShowConfigModal(false)}>
          <div className="config-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <Sparkles size={20} className="modal-icon" />
                <h3>Connect Gemini AI Doubt Solver</h3>
              </div>
              <button
                className="close-modal-btn"
                onClick={() => setShowConfigModal(false)}
                aria-label="Close setup modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-description">
                Your AI Doubt Solver runs securely via your Supabase Edge Function (<code>ai-doubt-solver</code>) powered by Google Gemini. Your Gemini API key remains securely stored in Supabase secrets on the server and is never exposed to frontend code.
              </p>

              <div className="setup-steps-list">
                <div className="step-item">
                  <div className="step-number">1</div>
                  <div className="step-content">
                    <strong>Configure Frontend Environment</strong>
                    <p>Add your Supabase project credentials to the root <code>.env</code> file:</p>
                    <pre className="env-code-preview">
                      <code>VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-publishable-key</code>
                    </pre>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-number">2</div>
                  <div className="step-content">
                    <strong>Supabase Edge Function (ai-doubt-solver)</strong>
                    <p>The chat sends doubts and multimodal attachments directly to your deployed Supabase Edge Function.</p>
                  </div>
                </div>

                <div className="step-item">
                  <div className="step-number">3</div>
                  <div className="step-content">
                    <strong>Google Gemini API Key</strong>
                    <p>Your Gemini API key is configured securely in your Supabase project secrets (Project Settings → Edge Functions → Secrets as <code>GEMINI_API_KEY</code>).</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn btn-primary"
                onClick={async () => {
                  await checkAiStatus();
                  setShowConfigModal(false);
                }}
              >
                Check Connection Status
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
