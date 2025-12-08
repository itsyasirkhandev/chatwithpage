import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { HumanMessage, AIMessage } from '@langchain/core/messages';

// DOM Elements
const apiKeySection = document.getElementById('api-key-section');
const apiKeyInput = document.getElementById('api-key');
const saveKeyBtn = document.getElementById('save-key-btn');
const chatSection = document.getElementById('chat-section');
const messagesDiv = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const statusDiv = document.getElementById('status');
const pageTitleEl = document.getElementById('page-title');

// State
let pageContent = null;
let chain = null;
let chatHistory = [];
let currentTabId = null;

// Initialize
async function init() {
  // Get current tab ID first
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab?.id;

  const savedKey = await getApiKey();
  if (savedKey) {
    apiKeySection.classList.add('hidden');
    chatSection.classList.remove('hidden');
    initLangChain(savedKey);
  }

  await loadPageContent();
  
  // Load existing chat history for this tab
  await loadChatHistory();

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
    messageDiv.textContent = msg.content;
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

// Handle save key button
async function handleSaveKey() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showStatus('Please enter an API key', 'error');
    return;
  }

  await saveApiKey(key);
  apiKeySection.classList.add('hidden');
  chatSection.classList.remove('hidden');
  initLangChain(key);
  showStatus('API key saved!', 'success');
}

// Initialize LangChain with Gemini and conversation memory
function initLangChain(apiKey) {
  const model = new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash-lite',
    apiKey: apiKey,
    streaming: true,
  });

  // Prompt template with conversation history
  const prompt = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are a helpful assistant that answers questions about webpage content. You have memory of the conversation and can refer back to previous messages.

Answer based on the following webpage content. If the information is not in the content, say "I don't see that information on this page." If the user asks about something from earlier in the conversation, use the chat history to answer.

Be concise and helpful. Format your response clearly.

Page Title: {title}
Page URL: {url}

Page Content:
{context}`,
    ],
    new MessagesPlaceholder('history'),
    ['human', '{question}'],
  ]);

  chain = RunnableSequence.from([
    {
      context: (input) => input.context,
      title: (input) => input.title,
      url: (input) => input.url,
      question: (input) => input.question,
      history: (input) => input.history,
    },
    prompt,
    model,
    new StringOutputParser(),
  ]);
}

// Load page content from active tab
async function loadPageContent() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || tab.url.startsWith('chrome://')) {
      updatePageTitle('Cannot access this page');
      showStatus('Cannot access Chrome internal pages', 'error');
      return;
    }

    updatePageTitle(tab.title || 'Loading...');

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'getContent',
    });

    if (response) {
      pageContent = response;
      updatePageTitle(response.title);
      showStatus('Ready to chat!', 'success');
    }
  } catch (error) {
    console.error('Error loading page content:', error);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content/content.js'],
      });

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'getContent',
      });

      if (response) {
        pageContent = response;
        updatePageTitle(response.title);
        showStatus('Ready to chat!', 'success');
      }
    } catch (retryError) {
      showStatus('Could not load page. Try refreshing.', 'error');
    }
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
    showStatus('Page content not loaded yet', 'error');
    return;
  }

  if (!chain) {
    showStatus('Please enter your API key first', 'error');
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
    // Truncate content if too long
    let context = pageContent.text;
    if (context.length > 50000) {
      context = context.substring(0, 50000) + '... [content truncated]';
    }

    // Create message element for streaming
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';

    // Remove typing indicator and add message element
    typingIndicator.remove();
    messagesDiv.appendChild(messageDiv);

    // Stream the response with chat history
    const stream = await chain.stream({
      context: context,
      title: pageContent.title,
      url: pageContent.url,
      question: question,
      history: chatHistory,
    });

    let fullResponse = '';
    for await (const chunk of stream) {
      fullResponse += chunk;
      messageDiv.textContent = fullResponse;
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // Add to conversation history after successful response
    chatHistory.push(new HumanMessage(question));
    chatHistory.push(new AIMessage(fullResponse));

    // Keep history manageable (last 10 exchanges = 20 messages)
    if (chatHistory.length > 20) {
      chatHistory = chatHistory.slice(-20);
    }

    // Save chat history to storage
    await saveChatHistory();

  } catch (error) {
    console.error('Error:', error);
    typingIndicator.remove();
    addMessage(`Error: ${error.message}`, 'error');
  } finally {
    sendBtn.disabled = false;
    userInput.focus();
  }
}

// Add message to chat
function addMessage(text, type) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  messageDiv.textContent = text;
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
document.addEventListener('DOMContentLoaded', init);
