# Chat with Page

A Chrome extension that lets you have AI-powered conversations about any webpage you're viewing. Built with LangChain, Google Gemini, and Vite.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?logo=googlechrome)
![LangChain](https://img.shields.io/badge/LangChain-Powered-blue)
![Gemini](https://img.shields.io/badge/Google-Gemini%202.5-orange?logo=google)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **Chat About Any Page** - Ask questions about the content of any webpage you're viewing
- **Streaming Responses** - See AI responses in real-time as they're generated
- **Conversation Memory** - The AI remembers your conversation context within each tab
- **Persistent History** - Chat history persists when you close and reopen the popup (cleared when tab closes)
- **Dynamic Content Support** - Extracts content from JavaScript-rendered pages
- **Modern UI** - Clean, accessible interface with proper contrast and smooth animations

## Tech Stack

| Technology | Purpose |
|------------|---------|
| [LangChain](https://js.langchain.com/) | LLM framework for chains, prompts, and memory |
| [Google Gemini 2.5 Flash Lite](https://ai.google.dev/) | Fast AI model for conversations |
| [Vite](https://vitejs.dev/) | Build tool with hot reload |
| [CRXJS](https://crxjs.dev/vite-plugin) | Chrome extension Vite plugin |
| [Lucide](https://lucide.dev/) | Icon library |

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- [Google AI Studio API Key](https://aistudio.google.com/api-keys)

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd langchain-chrome-extension
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```

4. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked"
   - Select the `dist` folder

## Usage

1. **Navigate to any webpage** you want to chat about

2. **Click the extension icon** in Chrome's toolbar

3. **Enter your Gemini API key** (first time only)
   - Get a free key from [Google AI Studio](https://aistudio.google.com/api-keys)
   - The key is stored locally and never shared

4. **Start chatting!**
   - Ask questions about the page content
   - Follow up with related questions
   - The AI remembers your conversation

### Example Questions

- "What is this article about?"
- "Summarize the main points"
- "What did you say earlier about X?"
- "Can you explain that in simpler terms?"

## Project Structure

```
langchain-chrome-extension/
├── src/
│   ├── popup/
│   │   ├── index.html      # Chat UI markup
│   │   ├── main.js         # LangChain integration & chat logic
│   │   └── style.css       # Modern styling
│   ├── content/
│   │   └── content.js      # Page content extraction
│   └── background/
│       └── background.js   # Service worker & history cleanup
├── public/
│   └── icons/              # Extension icons (16, 48, 128px)
├── dist/                   # Built extension (load this in Chrome)
├── manifest.json           # Extension configuration
├── vite.config.js          # Vite build configuration
└── package.json
```

## Development

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

### Development Mode

```bash
npm run dev
```

This starts Vite's dev server with hot module replacement. Changes to your code will automatically update the extension.

## How It Works

### Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Content       │     │    Popup        │     │   Background    │
│   Script        │────▶│    (Chat UI)    │────▶│   Service       │
│                 │     │                 │     │   Worker        │
│ Extracts page   │     │ LangChain chain │     │ Clears history  │
│ content (DOM)   │     │ + Gemini API    │     │ on tab close    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### LangChain Components Used

- **ChatGoogleGenerativeAI** - Gemini chat model wrapper
- **ChatPromptTemplate** - Structured prompt with system message and history
- **MessagesPlaceholder** - Injects conversation history into prompts
- **RunnableSequence** - Chains components together
- **StringOutputParser** - Parses streaming text output
- **HumanMessage / AIMessage** - Message types for history

### Data Flow

1. **Page Load** → Content script extracts rendered DOM text
2. **User Question** → Added to chat history, sent with context to Gemini
3. **AI Response** → Streamed to UI, added to history, saved to storage
4. **Tab Close** → Background script clears that tab's history

## Configuration

### Changing the Model

Edit `src/popup/main.js`:

```javascript
const model = new ChatGoogleGenerativeAI({
  model: 'gemini-2.5-flash-lite',  // Change model here
  apiKey: apiKey,
  streaming: true,
});
```

Available fast models:
- `gemini-2.5-flash-lite` (fastest)
- `gemini-2.5-flash` (balanced)
- `gemini-2.0-flash` (legacy)

### Adjusting History Limit

Edit the history limit in `src/popup/main.js`:

```javascript
// Keep last N exchanges (currently 10 exchanges = 20 messages)
if (chatHistory.length > 20) {
  chatHistory = chatHistory.slice(-20);
}
```

## Permissions

| Permission | Reason |
|------------|--------|
| `activeTab` | Access current tab's content |
| `storage` | Store API key and chat history |
| `scripting` | Inject content script |
| `tabs` | Detect tab closure for history cleanup |

## Troubleshooting

### Extension icon not showing
- Refresh the extension in `chrome://extensions/`
- Remove and re-add the extension

### "Could not load page content"
- Refresh the webpage
- Some pages (like `chrome://` URLs) cannot be accessed

### API errors
- Verify your API key is correct
- Check your Gemini API quota at [Google AI Studio](https://aistudio.google.com/)

## License

MIT License - feel free to use this project for learning or as a base for your own extensions.

## Acknowledgments

- [LangChain](https://js.langchain.com/) for the excellent JS/TS library
- [Google AI](https://ai.google.dev/) for Gemini API
- [CRXJS](https://crxjs.dev/) for the Vite plugin
