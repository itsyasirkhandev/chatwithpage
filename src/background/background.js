// Background service worker
// Handles extension lifecycle and chat history cleanup

chrome.runtime.onInstalled.addListener(() => {
  console.log('Chat with Page extension installed');
});

// Clear chat history when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  const key = `chatHistory_${tabId}`;
  chrome.storage.session.remove(key).then(() => {
    console.log(`Cleared chat history for tab ${tabId}`);
  }).catch((err) => {
    console.error('Error clearing chat history:', err);
  });
});

// Inject content script into tabs that were open before extension was installed
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url && !tab.url.startsWith('chrome://')) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/content/content.js'],
      });
    } catch (err) {
      console.error('Failed to inject content script:', err);
    }
  }
});
