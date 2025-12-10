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

// Model fallback chain
const MODEL_FALLBACK_CHAIN = [
  { name: 'gemini-2.5-flash-lite', displayName: 'Gemini 2.5 Flash Lite', speed: 'Fastest' },
  { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', speed: 'Fast' },
  { name: 'gemini-2.0-flash-lite', displayName: 'Gemini 2.0 Flash Lite', speed: 'Fast' },
  { name: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', speed: 'Balanced' }
];

let currentModelIndex = 0;  // Start with first model in chain
let lastFailedQuestion = null;  // Store last question that failed due to rate limit
let isHandlingRateLimit = false;  // Flag to prevent multiple simultaneous rate limit handlers
let rateLimitPromptShown = false;  // Flag to prevent showing prompt multiple times for same failure

// Request tracking for smart rate limit detection
let activeRequestId = null;  // Current active request ID
let lastRateLimitTime = 0;  // Timestamp of last rate limit detection
const RATE_LIMIT_COOLDOWN = 3000;  // 3 seconds between rate limit detections

// Get current model name
function getCurrentModel() {
  return MODEL_FALLBACK_CHAIN[currentModelIndex].name;
}

// Get next available model
function getNextModel() {
  if (currentModelIndex < MODEL_FALLBACK_CHAIN.length - 1) {
    return MODEL_FALLBACK_CHAIN[currentModelIndex + 1];
  }
  return null;
}

// Switch to next model
async function switchToNextModel() {
  const nextModel = getNextModel();
  if (nextModel) {
    currentModelIndex++;
    console.log(`🔄 Switching to model: ${nextModel.name}`);
    
    // Reinitialize chain with new model
    const apiKey = await getApiKey();
    if (useHybridMode) {
      initLangChainHybrid(apiKey);
    } else if (isLongDocument) {
      initLangChainRAG(apiKey);
    } else if (useSummaryMode) {
      initLangChainSummary(apiKey);
    } else {
      initLangChainStuffing(apiKey);
    }
    
    return true;
  }
  return false;
}

// Show final rate limit message when all models are exhausted
function showFinalRateLimitMessage() {
  const rateLimitDiv = document.createElement('div');
  rateLimitDiv.className = 'message rate-limit-message';
  rateLimitDiv.innerHTML = `
    <div class="rate-limit-header">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <strong>All Models Rate Limited</strong>
    </div>
    <div class="rate-limit-content">
      <p><strong>All available models have reached their rate limits.</strong></p>
      
      <div class="rate-limit-details">
        <h4>📊 Models Tried:</h4>
        <ul>
          ${MODEL_FALLBACK_CHAIN.map((m, i) => `<li><strong>${m.displayName}</strong> - ${m.speed}</li>`).join('')}
        </ul>
      </div>
      
      <div class="rate-limit-actions">
        <h4>⏱️ What to do now:</h4>
        <ol>
          <li><strong>Wait 60 seconds</strong> before sending another message</li>
          <li>Try spacing out your questions (one every 4-5 seconds)</li>
          <li><a href="https://aistudio.google.com/apikey" target="_blank">Check your quota usage</a></li>
          <li>Consider upgrading for higher limits</li>
        </ol>
      </div>
      
      <div class="rate-limit-tip">
        💡 <strong>Pro tip:</strong> The extension caches content, so reopening doesn't use API calls!
      </div>
    </div>
  `;
  
  messagesDiv.appendChild(rateLimitDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  toast.error('All Models Rate Limited', 'Please wait 60 seconds before trying again.', 8000);
}

// Show model switch prompt UI
function showModelSwitchPrompt() {
  const nextModel = getNextModel();
  if (!nextModel) {
    // No more models to fallback to
    showFinalRateLimitMessage();
    return;
  }
  
  const currentModel = MODEL_FALLBACK_CHAIN[currentModelIndex];
  
  const switchPromptDiv = document.createElement('div');
  switchPromptDiv.className = 'message model-switch-prompt';
  switchPromptDiv.innerHTML = `
    <div class="model-switch-header">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      <strong>Model Rate Limited</strong>
    </div>
    <div class="model-switch-content">
      <p><strong>${currentModel.displayName}</strong> has reached its rate limit.</p>
      <p>Would you like to switch to the next available model?</p>
      
      <div class="model-switch-info">
        <div class="model-current">
          <span class="model-label">Current:</span>
          <span class="model-name">${currentModel.displayName}</span>
          <span class="model-speed">${currentModel.speed}</span>
        </div>
        <div class="model-arrow">→</div>
        <div class="model-next">
          <span class="model-label">Switch to:</span>
          <span class="model-name">${nextModel.displayName}</span>
          <span class="model-speed">${nextModel.speed}</span>
        </div>
      </div>
      
      <div class="model-switch-actions">
        <button class="btn-switch-model" data-action="switch">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Switch Model & Continue
        </button>
        <button class="btn-cancel-switch" data-action="cancel">Cancel</button>
      </div>
    </div>
  `;
  
  messagesDiv.appendChild(switchPromptDiv);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  // Add event listeners
  const switchBtn = switchPromptDiv.querySelector('.btn-switch-model');
  const cancelBtn = switchPromptDiv.querySelector('.btn-cancel-switch');
  
  switchBtn.addEventListener('click', async () => {
    switchPromptDiv.remove();
    
    // Reset flags for next attempt
    rateLimitPromptShown = false;
    isHandlingRateLimit = false;
    lastRateLimitTime = 0;  // Reset cooldown timer
    
    const switched = await switchToNextModel();
    if (switched) {
      toast.success('Model Switched', `Now using ${nextModel.displayName}`, 3000);
      
      // Retry the last failed question if available
      if (lastFailedQuestion) {
        const question = lastFailedQuestion;
        lastFailedQuestion = null;
        
        // Add small delay to allow model initialization
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Set the input value and trigger send
        userInput.value = question;
        await handleSend();
      }
    }
  });
  
  cancelBtn.addEventListener('click', () => {
    switchPromptDiv.remove();
    
    // Reset flags
    rateLimitPromptShown = false;
    isHandlingRateLimit = false;
    lastFailedQuestion = null;
    activeRequestId = null;
    lastRateLimitTime = 0;
    
    toast.info('Cancelled', 'Model switch cancelled. Wait 60 seconds and try again.', 3000);
  });
}

// Intercept fetch to detect 429 errors immediately
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  try {
    const response = await originalFetch.apply(this, args);
    
    // Check if this is a Gemini API call that got rate limited
    if (response.status === 429 && args[0].includes('generativelanguage.googleapis.com')) {
      
      // GUARD 1: Must have an active request (not stale error)
      if (!activeRequestId) {
        console.log('⏭️ Ignoring stale 429 error (no active request)');
        return response;
      }
      
      // GUARD 2: Cooldown period to prevent spam
      const now = Date.now();
      const timeSinceLastDetection = now - lastRateLimitTime;
      
      if (timeSinceLastDetection < RATE_LIMIT_COOLDOWN) {
        console.log(`⏳ Ignoring 429 (cooldown: ${Math.round(timeSinceLastDetection/1000)}s/${RATE_LIMIT_COOLDOWN/1000}s)`);
        return response;
      }
      
      // GUARD 3: Already handling
      if (isHandlingRateLimit) {
        console.log('⏭️ Already handling rate limit');
        return response;
      }
      
      // ✅ NEW RATE LIMIT DETECTED
      console.log('🚨 NEW rate limit detected for active request!');
      
      // Clear console of old errors
      if (typeof console.clear === 'function') {
        console.clear();
        console.log('🧹 Console cleared - showing fresh rate limit info');
      }
      
      lastRateLimitTime = now;
      isHandlingRateLimit = true;
      
      // Show model switch prompt immediately (delay slightly to ensure DOM is ready)
      setTimeout(() => {
        // Remove typing indicator if it exists
        const indicator = messagesDiv?.querySelector('.typing-indicator');
        if (indicator) {
          indicator.remove();
        }
        
        // Re-enable send button
        if (sendBtn) {
          sendBtn.disabled = false;
        }
        
        // Store question if available (check last sent message)
        if (!lastFailedQuestion) {
          const messages = messagesDiv?.querySelectorAll('.message.user');
          if (messages && messages.length > 0) {
            const lastUserMessage = messages[messages.length - 1];
            lastFailedQuestion = lastUserMessage.textContent?.trim();
          }
        }
        
        // Check if there's a next model available
        const nextModel = getNextModel();
        if (nextModel && !rateLimitPromptShown) {
          // Show switch prompt only once
          rateLimitPromptShown = true;
          showModelSwitchPrompt();
          toast.warning('Rate Limit Reached', 'Model rate limited. Switch to continue.', 5000);
        } else if (!nextModel) {
          // All models exhausted - show final message
          rateLimitPromptShown = false;  // Reset for next time
          isHandlingRateLimit = false;
          showFinalRateLimitMessage();
        }
      }, 100);
    }
    
    return response;
  } catch (error) {
    console.error('Fetch interceptor error:', error);
    throw error;
  }
};

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
    // If markdown is extremely large (> 100k chars), use smart truncation first
    let processedMarkdown = markdown;
    if (markdown.length > 100000) {
      console.log('📝 Document very large (> 100k chars), applying smart truncation for summary...');
      processedMarkdown = await truncateMarkdownSafely(markdown, 100000);
    }
    
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
${processedMarkdown}

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
${processedMarkdown}

DETAILED SUMMARY:`;
    }

    const response = await model.invoke(summaryPrompt);
    documentSummary = response.content;
    
    console.log(`Generated ${targetSize} summary: ${documentSummary.length} chars (original: ${markdown.length} chars, processed: ${processedMarkdown.length} chars)`);
    console.log(`Token reduction: ${Math.round(processedMarkdown.length/4)} → ${Math.round(documentSummary.length/4)} tokens`);
    
  } catch (error) {
    console.error('Error generating summary:', error);
    toast.warning('Summary Failed', 'Using direct mode as fallback', 4000);
    useSummaryMode = false;
    documentSummary = null;
  }
}

// Calculate optimal chunk size and overlap based on document size
// Overlap is always 10-20% of chunk size for optimal context preservation
// Smaller docs use smaller chunks (better granularity) with higher overlap (more context)
// Larger docs use larger chunks (efficiency) with lower overlap (less redundancy)
function getOptimalChunkConfig(documentLength, useLargeChunks = false) {
  let chunkSize;
  let overlapPercent = 15; // 15% is middle of 10-20% range
  
  if (useLargeChunks) {
    // For truncation - use larger chunks to preserve more context when combining
    if (documentLength < 30000) {
      chunkSize = 1500;
    } else if (documentLength < 80000) {
      chunkSize = 2500;
    } else if (documentLength < 150000) {
      chunkSize = 3500;
    } else {
      chunkSize = 5000;
    }
  } else {
    // For RAG/retrieval - balanced chunks for better search
    if (documentLength < 20000) {
      chunkSize = 500;
      overlapPercent = 20; // Smaller docs need more overlap
    } else if (documentLength < 50000) {
      chunkSize = 800;
      overlapPercent = 18;
    } else if (documentLength < 100000) {
      chunkSize = 1200;
      overlapPercent = 15;
    } else if (documentLength < 200000) {
      chunkSize = 1800;
      overlapPercent = 12;
    } else {
      chunkSize = 2500;
      overlapPercent = 10;
    }
  }
  
  const chunkOverlap = Math.round(chunkSize * (overlapPercent / 100));
  
  console.log(`📊 Chunk config: size=${chunkSize}, overlap=${chunkOverlap} (${overlapPercent}%) for doc length=${documentLength.toLocaleString()} chars`);
  
  return { chunkSize, chunkOverlap };
}

// Smart truncation using markdown-aware splitting
async function truncateMarkdownSafely(markdown, maxChars = 50000) {
  try {
    // If already small enough, return as-is
    if (markdown.length <= maxChars) {
      return markdown;
    }
    
    // Get optimal chunk config for truncation (use larger chunks)
    const { chunkSize, chunkOverlap } = getOptimalChunkConfig(markdown.length, true);
    
    // Use markdown-aware splitting to get clean chunks
    const textSplitter = RecursiveCharacterTextSplitter.fromLanguage('markdown', {
      chunkSize,
      chunkOverlap,
    });
    
    const docs = await textSplitter.createDocuments([markdown]);
    const chunks = docs.map(doc => doc.pageContent);
    
    // Combine chunks until we reach maxChars
    let truncated = '';
    for (const chunk of chunks) {
      if (truncated.length + chunk.length <= maxChars) {
        truncated += chunk + '\n\n';
      } else {
        // Add partial chunk if we have room
        const remaining = maxChars - truncated.length;
        if (remaining > 500) {  // Only add if we have meaningful space
          truncated += chunk.substring(0, remaining);
        }
        break;
      }
    }
    
    console.log(`📝 Smart truncation: ${markdown.length} → ${truncated.length} chars (preserved markdown structure)`);
    return truncated + '\n\n... [content truncated at natural markdown boundary]';
    
  } catch (error) {
    console.error('Error in smart truncation:', error);
    // Fallback to simple truncation
    return markdown.substring(0, maxChars) + '... [content truncated]';
  }
}

// Setup RAG pipeline: split, embed, store
async function setupRAGPipeline(markdown, apiKey) {
  try {
    // Step 1: Get optimal chunk configuration based on document size
    const { chunkSize, chunkOverlap } = getOptimalChunkConfig(markdown.length, false);
    
    // Step 2: Split text into chunks with markdown-aware splitting
    const textSplitter = RecursiveCharacterTextSplitter.fromLanguage('markdown', {
      chunkSize,
      chunkOverlap,
    });
    
    console.log('📝 Using markdown-aware text splitting for RAG pipeline');
    
    const docs = await textSplitter.createDocuments([markdown]);
    
    // Step 3: Create embeddings
    const embedder = new GoogleGenerativeAIEmbeddings({
      apiKey: apiKey,
      modelName: 'text-embedding-004',
    });
    
    // Step 4: Embed all chunks and store them
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
  // Validation 1: Check if vector store exists
  if (!vectorStore) {
    console.warn('❌ Vector store not initialized');
    return [];
  }
  
  // Validation 2: Check if vector store has required properties
  if (!vectorStore.embeddings || !vectorStore.chunks || !vectorStore.embedder) {
    console.warn('❌ Vector store is missing required properties', {
      hasEmbeddings: !!vectorStore.embeddings,
      hasChunks: !!vectorStore.chunks,
      hasEmbedder: !!vectorStore.embedder
    });
    return [];
  }
  
  // Validation 3: Check if embeddings array is not empty
  if (vectorStore.embeddings.length === 0) {
    console.warn('❌ Vector store embeddings array is empty');
    return [];
  }
  
  // Validation 4: Check if embedder has embedQuery method
  if (typeof vectorStore.embedder.embedQuery !== 'function') {
    console.error('❌ Embedder does not have embedQuery method');
    return [];
  }
  
  try {
    // Embed the query
    console.log('🔍 Embedding query:', query.substring(0, 50) + '...');
    const queryEmbedding = await vectorStore.embedder.embedQuery(query);
    
    // Validation 5: Check if query embedding is valid
    if (!queryEmbedding || !Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      console.error('❌ Invalid query embedding generated', {
        type: typeof queryEmbedding,
        isArray: Array.isArray(queryEmbedding),
        length: queryEmbedding?.length
      });
      return [];
    }
    
    console.log(`✓ Query embedding generated: ${queryEmbedding.length} dimensions`);
    
    // Calculate similarities for all chunks
    const similarities = vectorStore.embeddings.map((embedding, index) => {
      // Skip invalid embeddings
      if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
        console.warn(`⚠️ Invalid embedding at index ${index}`);
        return { chunk: vectorStore.chunks[index] || '', score: 0, index };
      }
      
      // Skip if dimensions don't match
      if (embedding.length !== queryEmbedding.length) {
        console.warn(`⚠️ Dimension mismatch at index ${index}: ${embedding.length} vs ${queryEmbedding.length}`);
        return { chunk: vectorStore.chunks[index] || '', score: 0, index };
      }
      
      const score = cosineSimilarity(queryEmbedding, embedding);
      return {
        chunk: vectorStore.chunks[index] || '',
        score: isNaN(score) ? 0 : score,
        index
      };
    });
    
    // Filter valid results only
    const validSimilarities = similarities.filter(item => 
      item.chunk && 
      typeof item.score === 'number' && 
      !isNaN(item.score) &&
      item.score >= scoreThreshold
    );
    
    if (validSimilarities.length === 0) {
      console.warn('⚠️ No chunks passed similarity threshold');
      return [];
    }
    
    // Sort and get top k
    const filtered = validSimilarities
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    
    console.log(`✓ Retrieved ${filtered.length} chunks with scores:`, filtered.map(f => f.score.toFixed(3)));
    
    return filtered.map(item => item.chunk);
  } catch (error) {
    console.error('❌ Error retrieving chunks:', error);
    console.error('Stack trace:', error.stack);
    return [];
  }
}

// Initialize LangChain for Path A: Stuffing
function initLangChainStuffing(apiKey) {
  const currentModel = getCurrentModel();
  console.log(`Initializing LangChain in Stuffing mode with ${currentModel}`);
  
  const model = new ChatGoogleGenerativeAI({
    model: currentModel,
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
  const currentModel = getCurrentModel();
  console.log(`Initializing LangChain in Summary mode with ${currentModel}`);
  
  const model = new ChatGoogleGenerativeAI({
    model: currentModel,
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
  const currentModel = getCurrentModel();
  console.log(`Initializing LangChain in Hybrid mode with ${currentModel}`);
  
  const model = new ChatGoogleGenerativeAI({
    model: currentModel,
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
  const currentModel = getCurrentModel();
  console.log(`Initializing LangChain in RAG mode with ${currentModel}`);
  
  const model = new ChatGoogleGenerativeAI({
    model: currentModel,
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

  // Generate unique request ID for rate limit tracking
  activeRequestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  console.log('📤 Starting request:', activeRequestId);

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
      try {
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
      } catch (streamError) {
        // Rethrow to be caught by outer catch block
        console.error('Stream error in hybrid mode:', streamError);
        throw streamError;
      }

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
            model: getCurrentModel(),
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

          try {
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
          } catch (retrievalError) {
            console.error('Stream error in hybrid retrieval:', retrievalError);
            throw retrievalError;
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

      try {
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
      } catch (streamError) {
        console.error('Stream error in summary mode:', streamError);
        throw streamError;
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

      try {
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
      } catch (streamError) {
        console.error('Stream error in RAG mode:', streamError);
        throw streamError;
      }

      chatHistory.push(new HumanMessage(question));
      chatHistory.push(new AIMessage(fullResponse));
      
    } else {
      // Direct stuffing
      context = pageContent.text;
      
      // Use smart truncation if content is too large
      if (context.length > 50000) {
        console.log('📝 Content exceeds 50k chars, applying markdown-aware truncation...');
        context = await truncateMarkdownSafely(context, 50000);
      }
      
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message assistant';
      typingIndicator.remove();
      messagesDiv.appendChild(messageDiv);

      try {
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
      } catch (streamError) {
        console.error('Stream error in stuffing mode:', streamError);
        throw streamError;
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
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    // Remove typing indicator if it still exists
    const indicator = messagesDiv.querySelector('.typing-indicator');
    if (indicator) {
      indicator.remove();
    }
    
    // Handle specific error types
    let errorMsg = error.message || error.toString() || 'Unknown error occurred';
    let errorString = JSON.stringify(error).toLowerCase();
    let toastTitle = 'Chat Error';
    
    console.log('Error message:', errorMsg);
    console.log('Error string:', errorString);
    
    // Check for rate limit error (429) - check multiple sources
    const isRateLimit = 
      errorMsg.includes('429') || 
      errorMsg.includes('Too Many Requests') ||
      errorString.includes('429') ||
      errorString.includes('too many requests') ||
      (error.status && error.status === 429) ||
      (error.response && error.response.status === 429);
    
    if (isRateLimit) {
      console.log('🚨 Rate limit detected! Showing model switch prompt...');
      errorMsg = 'Model rate limited. Switch to continue.';
      toastTitle = 'Rate Limit Reached';
      
      // Store the failed question for retry after model switch
      lastFailedQuestion = question;
      
      // Show model switch prompt
      showModelSwitchPrompt();
      
      toast.warning(toastTitle, errorMsg, 5000);
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
    // Clear request ID on completion
    activeRequestId = null;
    console.log('✅ Request completed/failed');
    
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
