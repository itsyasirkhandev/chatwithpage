import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import typescript from 'highlight.js/lib/languages/typescript';

// Register languages for syntax highlighting
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('typescript', typescript);

// Configure marked for security and features
marked.setOptions({
  breaks: true,           // Convert \n to <br>
  gfm: true,              // GitHub Flavored Markdown
  highlight: function(code, lang) {
    // Syntax highlighting for code blocks
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (err) {
        console.error('Highlight error:', err);
      }
    }
    return hljs.highlightAuto(code).value;
  }
});

// Theme Management
const THEME_STORAGE_KEY = 'app-theme';

async function initTheme() {
  // Check for saved theme preference or default to 'light'
  const savedTheme = await getSavedTheme();
  const theme = savedTheme || getSystemTheme();
  applyTheme(theme);
  
  // Set up theme toggle listener
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
}

function getSystemTheme() {
  // Check system preference
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

async function getSavedTheme() {
  try {
    const result = await chrome.storage.local.get([THEME_STORAGE_KEY]);
    return result[THEME_STORAGE_KEY];
  } catch (error) {
    console.error('Error loading theme:', error);
    return null;
  }
}

async function saveTheme(theme) {
  try {
    await chrome.storage.local.set({ [THEME_STORAGE_KEY]: theme });
  } catch (error) {
    console.error('Error saving theme:', error);
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  
  // Update icon visibility
  const sunIcon = document.querySelector('.sun-icon');
  const moonIcon = document.querySelector('.moon-icon');
  
  if (sunIcon && moonIcon) {
    if (theme === 'dark') {
      sunIcon.classList.add('hidden');
      moonIcon.classList.remove('hidden');
    } else {
      sunIcon.classList.remove('hidden');
      moonIcon.classList.add('hidden');
    }
  }
}

async function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
  await saveTheme(newTheme);
}

// Listen to system theme changes
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async (e) => {
    const savedTheme = await getSavedTheme();
    // Only apply system theme if user hasn't set a preference
    if (!savedTheme) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
}

// Mode Badge & Status Indicators

/**
 * Update mode badge display
 * @param {string} mode - Mode: 'auto', 'stuffing', 'summary', 'hybrid', 'rag'
 */
function updateModeBadge(mode) {
  if (!modeBadge) return;
  
  const modeConfig = {
    auto: { icon: '🎯', text: 'Auto', title: 'Automatic mode selection' },
    stuffing: { icon: '📦', text: 'Direct', title: 'Direct document stuffing' },
    summary: { icon: '📝', text: 'Summary', title: 'Summary mode' },
    hybrid: { icon: '⚡', text: 'Hybrid', title: 'Summary with smart search' },
    rag: { icon: '🔍', text: 'RAG', title: 'Retrieval augmented generation' }
  };
  
  const config = modeConfig[mode] || modeConfig.auto;
  
  modeBadge.querySelector('.mode-icon').textContent = config.icon;
  modeBadge.querySelector('.mode-text').textContent = config.text;
  modeBadge.title = config.title;
  modeBadge.classList.remove('hidden');
}

/**
 * Update token counter display
 * @param {number} tokens - Estimated token count
 */
function updateTokenCounter(tokens) {
  if (!tokenCounter) return;
  
  const tokenCount = tokenCounter.querySelector('.token-count');
  const roundedTokens = Math.round(tokens);
  const cost = (roundedTokens / 1000000) * 0.075; // Gemini Flash 2.5 pricing
  
  // Format token count for display
  let formattedTokens;
  if (roundedTokens >= 1000000) {
    formattedTokens = `${(roundedTokens / 1000000).toFixed(2)}M`;
  } else if (roundedTokens >= 1000) {
    formattedTokens = `${(roundedTokens / 1000).toFixed(1)}K`;
  } else {
    formattedTokens = roundedTokens.toLocaleString();
  }
  
  // Build display text
  let displayText = `${formattedTokens} token${roundedTokens !== 1 ? 's' : ''}`;
  
  // Add cost if significant (> $0.001)
  if (cost >= 0.001) {
    displayText += ` • $${cost.toFixed(3)}`;
  } else if (cost > 0) {
    displayText += ` • <$0.001`;
  }
  
  tokenCount.innerHTML = displayText;
  tokenCounter.title = `Estimated ${roundedTokens.toLocaleString()} tokens\nApproximate cost: $${cost.toFixed(6)}\nBased on Gemini 2.5 Flash pricing`;
  tokenCounter.classList.remove('hidden');
}

/**
 * Update document stats display
 * @param {number} wordCount - Word count
 * @param {string} markdown - Document markdown (optional, for better calculation)
 */
function updateDocStats(wordCount, markdown = null) {
  if (!docStats) return;
  
  // Calculate read time (average 200 words per minute)
  const readTime = Math.max(1, Math.round(wordCount / 200));
  
  // Update display
  const statsText = docStats.querySelector('#doc-stats-text');
  statsText.textContent = `${wordCount.toLocaleString()} words • ${readTime}min read`;
  
  // Update title with more details
  if (markdown) {
    const lines = markdown.split('\n').length;
    const chars = markdown.length;
    docStats.title = `${wordCount.toLocaleString()} words • ${lines.toLocaleString()} lines • ${chars.toLocaleString()} characters • ${readTime} minute read`;
  } else {
    docStats.title = `${wordCount.toLocaleString()} words • Estimated ${readTime} minute read`;
  }
  
  docStats.classList.remove('hidden');
}

/**
 * Show context indicator (temporary badge for status)
 * @param {string} text - Indicator text
 * @param {string} icon - Icon emoji
 * @param {number} duration - Duration in ms
 */
function showContextIndicator(text, icon = '💡', duration = 3000) {
  const indicator = document.createElement('div');
  indicator.className = 'context-indicator';
  indicator.innerHTML = `
    <span class="indicator-icon">${icon}</span>
    <span class="indicator-text">${text}</span>
  `;
  
  document.body.appendChild(indicator);
  
  // Auto-remove
  setTimeout(() => {
    indicator.classList.add('removing');
    setTimeout(() => indicator.remove(), 300);
  }, duration);
}

// Toast Notification System
const toastContainer = document.getElementById('toast-container');
let toastIdCounter = 0;

/**
 * Show a toast notification
 * @param {Object} options - Toast options
 * @param {string} options.type - Type: 'success', 'error', 'warning', 'info'
 * @param {string} options.title - Toast title
 * @param {string} options.message - Toast message
 * @param {number} options.duration - Duration in ms (0 for persistent)
 * @returns {number} Toast ID
 */
function showToast({ type = 'info', title, message, duration = 5000 }) {
  const toastId = ++toastIdCounter;
  
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('data-toast-id', toastId);
  
  // Icon SVGs
  const icons = {
    success: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
  };
  
  // Build toast HTML
  toast.innerHTML = `
    <div class="toast-icon">${icons[type]}</div>
    <div class="toast-content">
      ${title ? `<div class="toast-title">${title}</div>` : ''}
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    <button class="toast-close" aria-label="Close notification">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/>
        <line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  `;
  
  // Add progress bar if auto-dismiss
  if (duration > 0) {
    const progress = document.createElement('div');
    progress.className = 'toast-progress';
    progress.style.setProperty('--duration', `${duration}ms`);
    toast.appendChild(progress);
  }
  
  // Add to container
  toastContainer.appendChild(toast);
  
  // Close button handler
  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => dismissToast(toastId));
  
  // Auto-dismiss
  if (duration > 0) {
    setTimeout(() => dismissToast(toastId), duration);
  }
  
  return toastId;
}

/**
 * Dismiss a toast by ID
 * @param {number} toastId - Toast ID
 */
function dismissToast(toastId) {
  const toast = toastContainer.querySelector(`[data-toast-id="${toastId}"]`);
  if (toast) {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }
}

/**
 * Dismiss all toasts
 */
function dismissAllToasts() {
  const toasts = toastContainer.querySelectorAll('.toast');
  toasts.forEach(toast => {
    const id = parseInt(toast.getAttribute('data-toast-id'));
    dismissToast(id);
  });
}

// Convenience methods
const toast = {
  success: (title, message, duration) => showToast({ type: 'success', title, message, duration }),
  error: (title, message, duration = 0) => showToast({ type: 'error', title, message, duration }),
  warning: (title, message, duration) => showToast({ type: 'warning', title, message, duration }),
  info: (title, message, duration) => showToast({ type: 'info', title, message, duration }),
  dismiss: dismissToast,
  dismissAll: dismissAllToasts
};

// Keyboard Shortcuts System
const shortcuts = {
  'Escape': () => {
    // Clear input or close any open modals
    const input = document.getElementById('user-input');
    if (input && input.value) {
      input.value = '';
      input.style.height = 'auto';
    } else {
      dismissAllToasts();
    }
  },
  'KeyK': (e) => {
    // Cmd/Ctrl+K: Focus input
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      const input = document.getElementById('user-input');
      if (input) {
        input.focus();
        toast.info('Keyboard Shortcut', 'Input focused', 1500);
      }
    }
  },
  'KeyL': (e) => {
    // Cmd/Ctrl+L: Clear chat
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      const messagesDiv = document.getElementById('messages');
      if (messagesDiv && chatHistory.length > 0) {
        if (confirm('Clear all chat history for this page?')) {
          chatHistory = [];
          saveChatHistory();
          messagesDiv.innerHTML = `
            <div class="welcome-message">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
              </svg>
              <p>Ask me anything about this page!</p>
            </div>
          `;
          toast.success('Chat Cleared', 'All messages have been removed', 2000);
        }
      }
    }
  },
  'Enter': (e) => {
    // Enter: Send message (already handled but added for completeness)
    // Shift+Enter: New line (handled by textarea)
    if (!e.shiftKey && e.target.id === 'user-input') {
      e.preventDefault();
      handleSend();
    }
  }
};

/**
 * Initialize keyboard shortcuts
 */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const handler = shortcuts[e.code];
    if (handler) {
      handler(e);
    }
  });
  
  // Show keyboard shortcuts hint on first load
  const hasSeenHint = localStorage.getItem('keyboard-shortcuts-seen');
  if (!hasSeenHint) {
    setTimeout(() => {
      toast.info('💡 Keyboard Shortcuts', 'Press Cmd/Ctrl+K to focus input, Cmd/Ctrl+L to clear chat, Esc to clear input', 8000);
      localStorage.setItem('keyboard-shortcuts-seen', 'true');
    }, 2000);
  }
}

// System Prompts
const STUFFING_SYSTEM_PROMPT = `You are a concise AI assistant analyzing webpage content.

Answer questions using ONLY the page content below. Keep answers brief and to-the-point.

RULES:
- Answer not in content? Say: "Not found on this page."
- 1-3 sentences max unless asked for detail
- Use markdown for code/lists
- Reference conversation history for follow-ups

PAGE CONTENT:
{context}`;

const RAG_SYSTEM_PROMPT = `You are a concise AI assistant searching a long document.

Answer using ONLY these retrieved snippets. Keep answers brief.

RULES:
- Answer not in snippets? Say: "Not found in retrieved sections."
- 1-3 sentences max unless asked for detail
- Cite specific snippets when possible
- Reference conversation history for follow-ups

SNIPPETS:
{context}`;

const SUMMARY_SYSTEM_PROMPT = `You are a concise AI assistant using a document summary.

Answer questions using ONLY this summary. Keep answers brief.

RULES:
- Answer not in summary? Say: "Not found in summary. Ask for details if needed."
- 1-3 sentences max unless asked for detail
- For detailed questions, suggest: "Summary may lack details. Try rephrasing."

SUMMARY:
{context}`;

const HYBRID_SUMMARY_PROMPT = `You are a concise AI assistant using a document summary.

Answer questions using ONLY this summary. Keep answers brief.

CRITICAL ESCALATION RULES:
- For GENERAL questions (tone, main idea, overview): Answer from summary
- For SPECIFIC questions (exact dates, code, quotes, section details): Say EXACTLY: "🔍 NEEDS_DETAIL: [brief description of what's needed]"
- Use conversation history for context

EXAMPLES:
✓ "What is this article about?" → Answer from summary
✓ "What's the author's main argument?" → Answer from summary  
✗ "What exact date was mentioned?" → "🔍 NEEDS_DETAIL: specific date mentioned in article"
✗ "Show me the code example" → "🔍 NEEDS_DETAIL: code example from article"

SUMMARY:
{context}`;

const HYBRID_RETRIEVAL_PROMPT = `You are a precise AI assistant. The user asked a specific question that requires detailed information.

SUMMARY (for context):
{summary}

RETRIEVED DETAILS:
{context}

Answer the question using the retrieved details. Be specific and cite exact information.`;

// Markdown Rendering Functions

/**
 * Safely render markdown to HTML
 * @param {string} markdown - Markdown text to render
 * @returns {string} - Safe HTML string
 */
function renderMarkdown(markdown) {
  // Parse markdown to HTML
  const html = marked.parse(markdown);
  return html;
}

/**
 * Add copy buttons to all code blocks
 * @param {HTMLElement} messageElement - Message element containing code blocks
 */
function addCopyButtons(messageElement) {
  const codeBlocks = messageElement.querySelectorAll('pre code');
  
  codeBlocks.forEach((codeBlock) => {
    const pre = codeBlock.parentElement;
    
    // Don't add button if already exists
    if (pre.querySelector('.code-copy-btn')) return;
    
    // Create copy button
    const copyButton = document.createElement('button');
    copyButton.className = 'code-copy-btn';
    copyButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      Copy
    `;
    
    copyButton.onclick = async () => {
      const code = codeBlock.textContent;
      await navigator.clipboard.writeText(code);
      
      // Show feedback
      copyButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Copied!
      `;
      copyButton.classList.add('copied');
      
      setTimeout(() => {
        copyButton.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          Copy
        `;
        copyButton.classList.remove('copied');
      }, 2000);
    };
    
    // Add button to pre element
    pre.style.position = 'relative';
    pre.appendChild(copyButton);
  });
}

/**
 * Render markdown with streaming animation
 * @param {HTMLElement} element - Target element
 * @param {string} markdown - Markdown text
 */
function renderMarkdownToElement(element, markdown) {
  const html = renderMarkdown(markdown);
  element.innerHTML = html;
  
  // Add smooth fade-in animation to new elements
  const newElements = element.querySelectorAll('p, h1, h2, h3, ul, ol, pre, blockquote');
  newElements.forEach((el, index) => {
    el.style.opacity = '0';
    el.style.animation = `fadeInUp 0.3s ease-out ${index * 0.05}s forwards`;
  });
  
  // Add copy buttons to code blocks
  addCopyButtons(element);
}

// DOM Elements (initialized after DOM loads to avoid ReferenceError)
let apiKeySection;
let apiKeyInput;
let saveKeyBtn;
let chatSection;
let messagesDiv;
let userInput;
let sendBtn;
let statusDiv;
let pageTitleEl;
let modeBadge;
let tokenCounter;
let docStats;

// State
let pageContent = null;
let chain = null;
let chatHistory = [];
let currentTabId = null;
let currentPageUrl = null;  // Track current page URL
let vectorStore = null;  // Store embeddings for RAG
let isLongDocument = false;  // Track which path we're using
let useSummaryMode = false;  // Track summary mode
let documentSummary = null;  // Store generated summary
let useHybridMode = false;  // Track hybrid mode (summary + search)
let needsMoreDetail = false;  // Track if LLM requested more info

// Initialize
async function init() {
  // Initialize DOM elements first
  apiKeySection = document.getElementById('api-key-section');
  apiKeyInput = document.getElementById('api-key');
  saveKeyBtn = document.getElementById('save-key-btn');
  chatSection = document.getElementById('chat-section');
  messagesDiv = document.getElementById('messages');
  userInput = document.getElementById('user-input');
  sendBtn = document.getElementById('send-btn');
  statusDiv = document.getElementById('status');
  pageTitleEl = document.getElementById('page-title');
  modeBadge = document.getElementById('mode-badge');
  tokenCounter = document.getElementById('token-counter');
  docStats = document.getElementById('doc-stats');
  
  // Get current tab ID first
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;

  const savedKey = await getApiKey();
  
  await loadPageContent();
  
  if (savedKey) {
    apiKeySection.classList.add('hidden');
    chatSection.classList.remove('hidden');
    
    // Load existing chat history for this tab
    await loadChatHistory();
    
    // Process content to determine which path to use
    await processPageContent(savedKey);
  }

  saveKeyBtn.addEventListener('click', handleSaveKey);
  sendBtn.addEventListener('click', handleSend);
  userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-resize textarea
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
  });
}

// Load chat history from storage
async function loadChatHistory() {
  if (!currentTabId) return;

  const key = `chatHistory_${currentTabId}`;
  
  try {
    const result = await chrome.storage.session.get([key]);
    
    if (result[key] && result[key].length > 0) {
      // Restore chat history as LangChain message objects
      chatHistory = result[key].map((msg) =>
        msg.role === 'human' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
      );
      
      // Render existing messages in UI
      renderChatHistory();
    }
  } catch (error) {
    console.error('Error loading chat history:', error);
  }
}

// Save chat history to storage
async function saveChatHistory() {
  if (!currentTabId) return;

  const key = `chatHistory_${currentTabId}`;
  
  try {
    // Serialize messages for storage
    const serialized = chatHistory.map((msg) => ({
      role: msg._getType(),
      content: msg.content,
    }));
    
    await chrome.storage.session.set({ [key]: serialized });
  } catch (error) {
    console.error('Error saving chat history:', error);
  }
}

// Render saved chat history in UI
function renderChatHistory() {
  // Clear welcome message if present
  const welcomeMsg = messagesDiv.querySelector('.welcome-message');
  if (welcomeMsg) {
    welcomeMsg.remove();
  }

  // Render each message
  chatHistory.forEach((msg) => {
    const type = msg._getType() === 'human' ? 'user' : 'assistant';
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    if (type === 'assistant') {
      renderMarkdownToElement(messageDiv, msg.content);
    } else {
      messageDiv.textContent = msg.content;
    }
    
    messagesDiv.appendChild(messageDiv);
  });

  // Scroll to bottom
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Get API key from storage
async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['geminiApiKey'], (result) => {
      resolve(result.geminiApiKey || null);
    });
  });
}

// Save API key to storage
async function saveApiKey(key) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ geminiApiKey: key }, resolve);
  });
}

// Save vector store and summary to cache
async function saveProcessingCache(tabId, url, summary, vectorStoreData) {
  if (!tabId || !url) return;
  
  const cacheKey = `processing_${tabId}_${url}`;
  
  try {
    const cacheData = {
      summary: summary,
      vectorStore: vectorStoreData,
      timestamp: Date.now(),
      url: url
    };
    
    await chrome.storage.session.set({ [cacheKey]: cacheData });
    console.log('✓ Saved processing cache for', url);
  } catch (error) {
    console.error('Error saving processing cache:', error);
  }
}

// Load vector store and summary from cache
async function loadProcessingCache(tabId, url) {
  if (!tabId || !url) return null;
  
  const cacheKey = `processing_${tabId}_${url}`;
  
  try {
    const result = await chrome.storage.session.get([cacheKey]);
    
    if (result[cacheKey]) {
      const cached = result[cacheKey];
      
      // Check if cache is for the same URL
      if (cached.url === url) {
        console.log('✓ Loaded processing cache from', new Date(cached.timestamp).toLocaleString());
        return cached;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error loading processing cache:', error);
    return null;
  }
}

// Handle save key button
async function handleSaveKey() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    toast.error('API Key Required', 'Please enter a valid API key');
    return;
  }

  await saveApiKey(key);
  toast.success('API Key Saved', 'Your API key has been saved successfully', 3000);
  apiKeySection.classList.add('hidden');
  chatSection.classList.remove('hidden');
  
  // Process content to determine which path to use
  await processPageContent(key);
}

// Show processing status indicator
function showProcessingStatus(message, details = '') {
  let statusDiv = document.getElementById('processing-status');
  
  if (!statusDiv) {
    statusDiv = document.createElement('div');
    statusDiv.id = 'processing-status';
    statusDiv.className = 'processing-status';
    messagesDiv.appendChild(statusDiv);
  }
  
  statusDiv.innerHTML = `
    <div class="processing-content">
      <div class="processing-spinner"></div>
      <div class="processing-text">
        <div class="processing-title">${message}</div>
        ${details ? `<div class="processing-details">${details}</div>` : ''}
      </div>
    </div>
  `;
  
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Hide processing status indicator
function hideProcessingStatus() {
  const statusDiv = document.getElementById('processing-status');
  if (statusDiv) {
    statusDiv.remove();
  }
}

// Process page content and decide which path to use
async function processPageContent(apiKey) {
  if (!pageContent || !pageContent.text) {
    toast.error('No Content', 'No page content available to process');
    return;
  }

  const markdown = pageContent.text;
  const estimatedTokens = markdown.length / 4;
  const wordCount = markdown.split(/\s+/).length;

  // Update document stats first
  updateDocStats(wordCount, markdown);
  updateTokenCounter(estimatedTokens);

  // Check if we have cached processing for this page
  const cached = await loadProcessingCache(currentTabId, currentPageUrl);
  
  if (cached && cached.vectorStore) {
    console.log('📦 Using cached processing - skipping expensive API calls');
    showProcessingStatus('Loading from Cache', 'Restoring previous processing...');
    
    // Restore cached data
    documentSummary = cached.summary || null;
    
    // Restore vector store
    if (cached.vectorStore && cached.vectorStore.chunks && cached.vectorStore.embeddings) {
      vectorStore = {
        chunks: cached.vectorStore.chunks,
        embeddings: cached.vectorStore.embeddings,
        embedder: new GoogleGenerativeAIEmbeddings({
          apiKey: apiKey,
          modelName: 'text-embedding-004'
        })
      };
      console.log(`✓ Restored ${vectorStore.chunks.length} chunks from cache`);
    }
    
    // Determine mode based on what was cached
    if (estimatedTokens < 10000) {
      isLongDocument = false;
      useSummaryMode = false;
      useHybridMode = false;
      updateModeBadge('stuffing');
      initLangChainStuffing(apiKey);
    } else if (documentSummary && vectorStore) {
      isLongDocument = false;
      useSummaryMode = false;
      useHybridMode = true;
      updateModeBadge('hybrid');
      initLangChainHybrid(apiKey);
      const summaryTokens = Math.round(documentSummary.length / 4);
      updateTokenCounter(summaryTokens);
    } else if (vectorStore) {
      isLongDocument = true;
      useSummaryMode = false;
      useHybridMode = false;
      updateModeBadge('rag');
      initLangChainRAG(apiKey);
    } else {
      // Fallback to direct mode if cache is incomplete
      isLongDocument = false;
      useSummaryMode = false;
      useHybridMode = false;
      updateModeBadge('stuffing');
      initLangChainStuffing(apiKey);
    }
    
    hideProcessingStatus();
    toast.success('Loaded from Cache', 'Using previously processed content - instant load!', 2000);
    return;
  }
  
  // No cache found - process normally
  console.log('🔄 No cache found - processing document');
  showProcessingStatus('Analyzing Document', 'Determining optimal processing strategy...');

  if (estimatedTokens < 10000) {
    // Path A: Direct stuffing (< 10k tokens)
    isLongDocument = false;
    useSummaryMode = false;
    useHybridMode = false;
    vectorStore = null;
    documentSummary = null;
    
    showProcessingStatus('Initializing Direct Mode', 'Small document - using direct processing');
    updateModeBadge('stuffing');
    initLangChainStuffing(apiKey);
    hideProcessingStatus();
    toast.success('Ready to Chat', `Document: ${Math.round(estimatedTokens).toLocaleString()} tokens (direct mode)`, 3000);
    
  } else if (estimatedTokens < 20000) {
    // Path B: Hybrid Summary+Search (10k-20k tokens)
    isLongDocument = false;
    useSummaryMode = false;
    useHybridMode = true;
    
    showProcessingStatus('Initializing Hybrid Mode', 'Medium document - generating summary and search index...');
    
    // Generate both summary AND embeddings in parallel
    const tasks = [];
    
    // Task 1: Generate summary
    showProcessingStatus('Creating Summary', 'Generating compact summary with AI...');
    tasks.push(generateSummary(markdown, apiKey, 'compact'));
    
    // Task 2: Setup RAG
    showProcessingStatus('Building Search Index', 'Creating embeddings for semantic search...');
    tasks.push(setupRAGPipeline(markdown, apiKey));
    
    await Promise.all(tasks);
    
    if (documentSummary && vectorStore) {
      showProcessingStatus('Finalizing', 'Setting up chat interface...');
      updateModeBadge('hybrid');
      initLangChainHybrid(apiKey);
      const summaryTokens = Math.round(documentSummary.length / 4);
      updateTokenCounter(summaryTokens); // Update to show compressed tokens
      
      // Save to cache for next time
      await saveProcessingCache(currentTabId, currentPageUrl, documentSummary, {
        chunks: vectorStore.chunks,
        embeddings: vectorStore.embeddings
      });
      
      hideProcessingStatus();
      toast.success('Hybrid Ready', `${Math.round(estimatedTokens).toLocaleString()} → ${summaryTokens.toLocaleString()} tokens + smart search`, 3000);
    } else {
      // Fallback
      useHybridMode = false;
      updateModeBadge('stuffing');
      initLangChainStuffing(apiKey);
      hideProcessingStatus();
      toast.warning('Fallback Mode', `Using direct mode (${Math.round(estimatedTokens).toLocaleString()} tokens)`, 3000);
    }
    
  } else if (estimatedTokens < 30000) {
    // Path C: Summary-first with auto-escalation (20k-30k tokens)
    isLongDocument = false;
    useSummaryMode = false;
    useHybridMode = true;
    
    showProcessingStatus('Processing Large Document', 'This may take 30-60 seconds...');
    
    // Task 1: Generate summary
    showProcessingStatus('Creating Summary', 'Generating comprehensive summary with AI...');
    const summaryPromise = generateSummary(markdown, apiKey, 'standard');
    
    // Task 2: Setup RAG
    showProcessingStatus('Building Search Index', 'Creating embeddings for semantic search...');
    const ragPromise = setupRAGPipeline(markdown, apiKey);
    
    await Promise.all([summaryPromise, ragPromise]);
    
    if (documentSummary && vectorStore) {
      showProcessingStatus('Finalizing', 'Setting up hybrid chat mode...');
      updateModeBadge('hybrid');
      const summaryTokens = Math.round(documentSummary.length / 4);
      updateTokenCounter(summaryTokens); // Show compressed tokens
      initLangChainHybrid(apiKey);
      
      // Save to cache for next time
      await saveProcessingCache(currentTabId, currentPageUrl, documentSummary, {
        chunks: vectorStore.chunks,
        embeddings: vectorStore.embeddings
      });
      
      hideProcessingStatus();
      toast.success('Summary + Search Ready', `${Math.round(estimatedTokens).toLocaleString()} tokens processed`, 3000);
    } else {
      useHybridMode = false;
      updateModeBadge('rag');
      await setupRAGPipeline(markdown, apiKey);
      initLangChainRAG(apiKey);
      
      // Save RAG-only cache
      if (vectorStore) {
        await saveProcessingCache(currentTabId, currentPageUrl, null, {
          chunks: vectorStore.chunks,
          embeddings: vectorStore.embeddings
        });
      }
      
      hideProcessingStatus();
      toast.success('Search Ready', `${Math.round(estimatedTokens).toLocaleString()} tokens indexed`, 3000);
    }
    
  } else {
    // Path D: Pure RAG (> 30k tokens - too big for useful summaries)
    isLongDocument = true;
    useSummaryMode = false;
    useHybridMode = false;
    documentSummary = null;
    
    showProcessingStatus('Processing Very Large Document', 'This may take 60-90 seconds...');
    showProcessingStatus('Splitting Document', 'Breaking into searchable chunks...');
    updateModeBadge('rag');
    
    showProcessingStatus('Creating Embeddings', 'Generating AI embeddings for search...');
    await setupRAGPipeline(markdown, apiKey);
    
    showProcessingStatus('Finalizing', 'Setting up RAG search interface...');
    initLangChainRAG(apiKey);
    
    // Save to cache for next time
    if (vectorStore) {
      await saveProcessingCache(currentTabId, currentPageUrl, null, {
        chunks: vectorStore.chunks,
        embeddings: vectorStore.embeddings
      });
    }
    
    hideProcessingStatus();
    
    toast.success('RAG Search Ready', `${Math.round(estimatedTokens).toLocaleString()} tokens indexed and searchable`, 3000);
  }
}

// Generate a high-density summary for borderline documents
async function generateSummary(markdown, apiKey, targetSize = 'standard') {
  try {
    const model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',  // Use fast model for summarization
      apiKey: apiKey,
      temperature: 0.3,  // Lower temp for factual summary
    });

    let summaryPrompt;
    
    if (targetSize === 'compact') {
      // For hybrid mode: smaller, more focused summary
      summaryPrompt = `You are a precise summarizer. Create a COMPACT summary of this webpage.

REQUIREMENTS:
- Length: 500-1000 tokens (be concise but comprehensive)
- Focus on: main ideas, key arguments, overall structure
- Include: important names, dates, and concepts (but not exhaustive details)
- Use markdown headings to organize

DO NOT:
- Include every detail (that's what retrieval is for)
- Quote large code blocks
- List every example

WEBPAGE CONTENT:
${markdown}

COMPACT SUMMARY:`;
    } else {
      // Standard detailed summary (existing implementation)
      summaryPrompt = `You are a precise summarizer. Create a comprehensive, detailed summary of this webpage.

REQUIREMENTS:
- Capture ALL key information: dates, names, numbers, concepts, arguments
- Preserve technical terms, code concepts, and specific details
- Use markdown headings to organize by topic
- Include important quotes or data points
- Length: 1000-2000 tokens (be thorough but efficient)

DO NOT:
- Skip important details
- Generalize specifics
- Add your own commentary

WEBPAGE CONTENT:
${markdown}

DETAILED SUMMARY:`;
    }

    const response = await model.invoke(summaryPrompt);
    documentSummary = response.content;
    
    console.log(`Generated ${targetSize} summary: ${documentSummary.length} chars (original: ${markdown.length} chars)`);
    console.log(`Token reduction: ${Math.round(markdown.length/4)} → ${Math.round(documentSummary.length/4)} tokens`);
    
  } catch (error) {
    console.error('Error generating summary:', error);
    toast.warning('Summary Failed', 'Using direct mode as fallback', 4000);
    useSummaryMode = false;
    documentSummary = null;
  }
}

// Setup RAG pipeline: split, embed, store
async function setupRAGPipeline(markdown, apiKey) {
  try {
    // Step 1: Split text into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    const docs = await textSplitter.createDocuments([markdown]);
    
    // Step 2: Create embeddings
    const embedder = new GoogleGenerativeAIEmbeddings({
      apiKey: apiKey,
      modelName: 'text-embedding-004',
    });
    
    // Step 3: Embed all chunks and store them
    const chunks = docs.map(doc => doc.pageContent);
    const embeddings = await Promise.all(
      chunks.map(chunk => embedder.embedQuery(chunk))
    );
    
    // Store chunks with their embeddings in memory
    vectorStore = {
      chunks,
      embeddings,
      embedder
    };
    
    console.log(`Created vector store with ${chunks.length} chunks`);
  } catch (error) {
    console.error('Error setting up RAG pipeline:', error);
    toast.error('Processing Error', 'Using fallback mode', 5000);
    isLongDocument = false;
    vectorStore = null;
  }
}

// Calculate cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
  // Safety checks
  if (!vecA || !vecB || !Array.isArray(vecA) || !Array.isArray(vecB)) {
    console.error('Invalid vectors for similarity calculation', { vecA, vecB });
    return 0;
  }
  
  if (vecA.length !== vecB.length) {
    console.error('Vector length mismatch', { vecALength: vecA.length, vecBLength: vecB.length });
    return 0;
  }
  
  try {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    
    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }
    
    return dotProduct / (magnitudeA * magnitudeB);
  } catch (error) {
    console.error('Error calculating cosine similarity:', error);
    return 0;
  }
}

// Retrieve relevant chunks based on query
async function retrieveRelevantChunks(query, k = 4, scoreThreshold = 0.5) {
  if (!vectorStore) {
    console.warn('Vector store not initialized');
    return [];
  }
  
  if (!vectorStore.embeddings || !vectorStore.chunks || vectorStore.embeddings.length === 0) {
    console.warn('Vector store is empty or invalid');
    return [];
  }
  
  try {
    // Embed the query
    const queryEmbedding = await vectorStore.embedder.embedQuery(query);
    
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
      console.error('Invalid query embedding');
      return [];
    }
    
    // Calculate similarities for all chunks
    const similarities = vectorStore.embeddings.map((embedding, index) => {
      if (!embedding || !Array.isArray(embedding)) {
        console.warn(`Invalid embedding at index ${index}`);
        return { chunk: vectorStore.chunks[index], score: 0, index };
      }
      
      return {
        chunk: vectorStore.chunks[index],
        score: cosineSimilarity(queryEmbedding, embedding),
        index
      };
    });
    
    // Filter by threshold and sort by score
    const filtered = similarities
      .filter(item => item.score >= scoreThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    
    console.log(`Retrieved ${filtered.length} chunks with scores:`, filtered.map(f => f.score.toFixed(3)));
    
    return filtered.map(item => item.chunk);
  } catch (error) {
    console.error('Error retrieving chunks:', error);
    return [];
  }
}

// Initialize LangChain for Path A: Stuffing
function initLangChainStuffing(apiKey) {
  console.log('Initializing LangChain in Stuffing mode');
  
  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash-lite',
    apiKey: apiKey,
    streaming: true,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', STUFFING_SYSTEM_PROMPT],
    new MessagesPlaceholder('history'),
    ['human', '{question}'],
  ]);

  chain = RunnableSequence.from([
    {
      context: (input) => input.context,
      question: (input) => input.question,
      history: (input) => input.history,
    },
    prompt,
    model,
    new StringOutputParser(),
  ]);
  
  console.log('Chain initialized successfully');
}

// Initialize LangChain for Path B: Summary Mode
function initLangChainSummary(apiKey) {
  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash-lite',
    apiKey: apiKey,
    streaming: true,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', SUMMARY_SYSTEM_PROMPT],
    new MessagesPlaceholder('history'),
    ['human', '{question}'],
  ]);

  chain = RunnableSequence.from([
    {
      context: (input) => input.context,
      question: (input) => input.question,
      history: (input) => input.history,
    },
    prompt,
    model,
    new StringOutputParser(),
  ]);
}

// Initialize LangChain for Hybrid Mode (Summary-first with retrieval fallback)
function initLangChainHybrid(apiKey) {
  console.log('Initializing LangChain in Hybrid mode');
  
  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash-lite',
    apiKey: apiKey,
    streaming: true,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', HYBRID_SUMMARY_PROMPT],
    new MessagesPlaceholder('history'),
    ['human', '{question}'],
  ]);

  chain = RunnableSequence.from([
    {
      context: (input) => input.context,
      question: (input) => input.question,
      history: (input) => input.history,
    },
    prompt,
    model,
    new StringOutputParser(),
  ]);
  
  console.log('Chain initialized successfully');
}

// Initialize LangChain for Path C: RAG
function initLangChainRAG(apiKey) {
  console.log('Initializing LangChain in RAG mode');
  
  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash-lite',
    apiKey: apiKey,
    streaming: true,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', RAG_SYSTEM_PROMPT],
    new MessagesPlaceholder('history'),
    ['human', '{question}'],
  ]);

  chain = RunnableSequence.from([
    {
      context: (input) => input.context,
      question: (input) => input.question,
      history: (input) => input.history,
    },
    prompt,
    model,
    new StringOutputParser(),
  ]);
  
  console.log('Chain initialized successfully');
}

// Load page content from active tab
async function loadPageContent() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      toast.error('No Tab', 'Could not find active tab');
      return;
    }

    // Check for restricted URLs
    if (tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('edge://') ||
        tab.url.startsWith('about:')) {
      updatePageTitle('Cannot access this page');
      toast.error('Access Denied', 'Cannot access browser internal pages');
      return;
    }

    updatePageTitle(tab.title || 'Loading...');

    // Try to communicate with content script
    let response = null;
    try {
      response = await chrome.tabs.sendMessage(tab.id, {
        action: 'getContent',
      });
    } catch (sendError) {
      console.log('Content script not ready, waiting and retrying...');
      
      // Content script is likely still loading, wait and retry
      try {
        // Wait longer for content script to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Try again
        response = await chrome.tabs.sendMessage(tab.id, {
          action: 'getContent',
        });
      } catch (retryError) {
        console.error('Content script still not available:', retryError);
        throw new Error('Please refresh the page and reopen the extension');
      }
    }

    if (response && response.text) {
      pageContent = response;
      currentPageUrl = tab.url;  // Track current URL
      updatePageTitle(response.title);
      toast.success('Ready', 'You can now chat with this page', 2000);
    } else {
      throw new Error('No content received from page');
    }
  } catch (error) {
    console.error('Error loading page content:', error);
    toast.error('Load Failed', error.message || 'Could not load page content. Please refresh the page.');
    updatePageTitle('Error loading page');
  }
}

// Update page title in header
function updatePageTitle(title) {
  const span = pageTitleEl.querySelector('span');
  if (span) {
    span.textContent = title;
  }
}

// Handle send button with streaming and memory
async function handleSend() {
  const question = userInput.value.trim();
  if (!question) return;

  if (!pageContent) {
    toast.error('Not Ready', 'Page content not loaded yet. Please wait.');
    return;
  }

  if (!chain) {
    toast.error('API Key Required', 'Please enter your Gemini API key first');
    return;
  }

  // Clear welcome message if present
  const welcomeMsg = messagesDiv.querySelector('.welcome-message');
  if (welcomeMsg) {
    welcomeMsg.remove();
  }

  // Add user message to UI
  addMessage(question, 'user');
  userInput.value = '';
  userInput.style.height = 'auto';

  // Show typing indicator
  const typingIndicator = showTypingIndicator();
  sendBtn.disabled = true;

  try {
    let context;
    let fullResponse = '';

    console.log('Starting chat with mode:', { useHybridMode, useSummaryMode, isLongDocument, hasVectorStore: !!vectorStore, hasSummary: !!documentSummary });

    if (useHybridMode && documentSummary && vectorStore) {
      // HYBRID MODE: Try summary first, escalate if needed
      console.log('Using Hybrid mode');
      
      // Step 1: Try answering with summary
      context = documentSummary;
      
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message assistant';
      typingIndicator.remove();
      messagesDiv.appendChild(messageDiv);

      console.log('Calling chain.stream() with hybrid mode...');
      const stream = await chain.stream({
        context: context,
        question: question,
        history: chatHistory,
      });

      console.log('Stream received, processing chunks...');
      let chunkCount = 0;
      for await (const chunk of stream) {
        chunkCount++;
        fullResponse += chunk;
        renderMarkdownToElement(messageDiv, fullResponse);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
      console.log(`Received ${chunkCount} chunks, total response length: ${fullResponse.length}`);

      // Step 2: Check if LLM requested more detail
      if (fullResponse.includes('🔍 NEEDS_DETAIL:')) {
        // Extract what's needed
        const match = fullResponse.match(/🔍 NEEDS_DETAIL:\s*(.+)/);
        const detailNeeded = match ? match[1] : 'specific information';
        
        // Show "searching..." indicator
        messageDiv.textContent = `Searching for ${detailNeeded}...`;
        
        // Retrieve specific chunks
        const relevantChunks = await retrieveRelevantChunks(question, 4, 0.5);
        const retrievedContext = relevantChunks.join('\n\n---\n\n');
        
        if (retrievedContext) {
          // Create new chain for retrieval response
          const retrievalModel = new ChatGoogleGenerativeAI({
            model: 'gemini-2.5-flash-lite',
            apiKey: await getApiKey(),
            streaming: true,
          });

          const retrievalPrompt = ChatPromptTemplate.fromMessages([
            ['system', HYBRID_RETRIEVAL_PROMPT],
            new MessagesPlaceholder('history'),
            ['human', '{question}'],
          ]);

          const retrievalChain = RunnableSequence.from([
            {
              summary: () => documentSummary,
              context: () => retrievedContext,
              question: (input) => input.question,
              history: (input) => input.history,
            },
            retrievalPrompt,
            retrievalModel,
            new StringOutputParser(),
          ]);

          const retrievalStream = await retrievalChain.stream({
            question: question,
            history: chatHistory,
          });

          fullResponse = '';
          for await (const chunk of retrievalStream) {
            fullResponse += chunk;
            renderMarkdownToElement(messageDiv, fullResponse);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
          }
        } else {
          renderMarkdownToElement(messageDiv, 'Could not find specific details. The summary may be your best answer.');
        }
      }

      // Add to history
      chatHistory.push(new HumanMessage(question));
      chatHistory.push(new AIMessage(fullResponse));
      
    } else if (useSummaryMode && documentSummary) {
      // Pure summary mode (no hybrid)
      context = documentSummary;
      
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message assistant';
      typingIndicator.remove();
      messagesDiv.appendChild(messageDiv);

      const stream = await chain.stream({
        context: context,
        question: question,
        history: chatHistory,
      });

      for await (const chunk of stream) {
        fullResponse += chunk;
        renderMarkdownToElement(messageDiv, fullResponse);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }

      chatHistory.push(new HumanMessage(question));
      chatHistory.push(new AIMessage(fullResponse));
      
    } else if (isLongDocument && vectorStore) {
      // Pure RAG mode
      const relevantChunks = await retrieveRelevantChunks(question, 4, 0.5);
      context = relevantChunks.join('\n\n---\n\n');
      
      if (!context) {
        context = 'No relevant information found in the document.';
      }
      
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message assistant';
      typingIndicator.remove();
      messagesDiv.appendChild(messageDiv);

      const stream = await chain.stream({
        context: context,
        question: question,
        history: chatHistory,
      });

      for await (const chunk of stream) {
        fullResponse += chunk;
        renderMarkdownToElement(messageDiv, fullResponse);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }

      chatHistory.push(new HumanMessage(question));
      chatHistory.push(new AIMessage(fullResponse));
      
    } else {
      // Direct stuffing
      context = pageContent.text;
      if (context.length > 50000) {
        context = context.substring(0, 50000) + '... [content truncated]';
      }
      
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message assistant';
      typingIndicator.remove();
      messagesDiv.appendChild(messageDiv);

      const stream = await chain.stream({
        context: context,
        question: question,
        history: chatHistory,
      });

      for await (const chunk of stream) {
        fullResponse += chunk;
        renderMarkdownToElement(messageDiv, fullResponse);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }

      chatHistory.push(new HumanMessage(question));
      chatHistory.push(new AIMessage(fullResponse));
    }

    // Keep history manageable (last 10 exchanges = 20 messages)
    if (chatHistory.length > 20) {
      chatHistory = chatHistory.slice(-20);
    }

    // Save chat history to storage
    await saveChatHistory();

  } catch (error) {
    console.error('Error in handleSend:', error);
    console.error('Error stack:', error.stack);
    
    // Remove typing indicator if it still exists
    const indicator = messagesDiv.querySelector('.typing-indicator');
    if (indicator) {
      indicator.remove();
    }
    
    // Handle specific error types
    let errorMsg = error.message || 'Unknown error occurred';
    let toastTitle = 'Chat Error';
    
    // Check for rate limit error (429)
    if (errorMsg.includes('429') || errorMsg.includes('Too Many Requests')) {
      errorMsg = 'API quota exceeded. Please wait before trying again.';
      toastTitle = 'Quota Exceeded';
      addMessage('🚫 **Your Gemini API Key Quota Has Been Reached**\n\n' +
        '**What this means:**\n' +
        '• You\'ve hit the free tier limit of 15 requests per minute\n' +
        '• Your API key needs time to reset its quota\n\n' +
        '**What to do:**\n' +
        '• ⏱️ Wait 60 seconds and try again\n' +
        '• 💡 Free tier: 15 requests/min, 1,500 requests/day\n' +
        '• 🔗 Check your quota: [Google AI Studio](https://aistudio.google.com/apikey)\n' +
        '• ⭐ Consider upgrading for higher limits', 'error');
    }
    // Check for service unavailable (503)
    else if (errorMsg.includes('503') || errorMsg.includes('Service Unavailable')) {
      errorMsg = 'Gemini API is temporarily unavailable. Please try again in a moment.';
      toastTitle = 'Service Unavailable';
      addMessage('🔧 The Gemini API service is temporarily unavailable. This is usually brief - please wait 10-30 seconds and try again.', 'error');
    }
    // Check for server error (500, 502, 504)
    else if (errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('504')) {
      errorMsg = 'Server error. Please try again shortly.';
      toastTitle = 'Server Error';
      addMessage('⚠️ Gemini API encountered a server error. Please wait a moment and try again.', 'error');
    }
    // Check for invalid API key (400, 401, 403)
    else if (errorMsg.includes('400') || errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('API_KEY_INVALID')) {
      errorMsg = 'Invalid API key. Please check your Gemini API key.';
      toastTitle = 'Invalid API Key';
      addMessage('❌ Your API key appears to be invalid. Please get a new one from Google AI Studio: https://aistudio.google.com/apikey', 'error');
    }
    // Generic network error
    else if (errorMsg.includes('Failed to fetch') || errorMsg.includes('Network')) {
      errorMsg = 'Network error. Please check your connection.';
      toastTitle = 'Network Error';
      addMessage('🌐 Could not connect to Gemini API. Please check your internet connection.', 'error');
    }
    // Other errors
    else {
      addMessage(`Error: ${errorMsg}`, 'error');
    }
    
    toast.error(toastTitle, errorMsg, 5000);
  } finally {
    sendBtn.disabled = false;
    userInput.focus();
  }
}

// Add message to chat
function addMessage(text, type) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  
  if (type === 'assistant') {
    renderMarkdownToElement(messageDiv, text);
  } else {
    messageDiv.textContent = text;
  }
  
  messagesDiv.appendChild(messageDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Show typing indicator
function showTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';
  messagesDiv.appendChild(indicator);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  return indicator;
}

// Show status message
function showStatus(message, type = '') {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;

  if (type === 'success') {
    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'status';
    }, 3000);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  initKeyboardShortcuts();
  await init();
});
