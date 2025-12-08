// Content script - extracts page content including dynamically loaded content
async function extractPageContent() {
  // Wait for dynamic content to load
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Remove script and style tags for cleaner text
  const clone = document.body.cloneNode(true);
  const scripts = clone.querySelectorAll('script, style, noscript');
  scripts.forEach((el) => el.remove());

  return {
    text: clone.innerText.trim(),
    title: document.title,
    url: window.location.href,
  };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getContent') {
    extractPageContent().then(sendResponse);
    return true; // Keep the message channel open for async response
  }
});
