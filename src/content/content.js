// Content script - extracts page content using Readability, DOMPurify, and Turndown
import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import TurndownService from 'turndown';

async function extractPageContent() {
  // Wait for dynamic content to load
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Step 1: Use Readability to extract article content (Reader View)
  const documentClone = document.cloneNode(true);
  const reader = new Readability(documentClone);
  const article = reader.parse();

  if (!article) {
    // Fallback to basic extraction if Readability fails
    return fallbackExtraction();
  }

  // Step 2: Sanitize HTML with DOMPurify for security
  const cleanHtml = DOMPurify.sanitize(article.content, {
    ALLOWED_TAGS: [
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody',
      'strong', 'em', 'a', 'br', 'blockquote', 'code', 'pre', 'div', 'span'
    ],
    ALLOWED_ATTR: ['href']
  });

  // Step 3: Convert to Markdown with Turndown to preserve structure
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced'
  });
  const markdown = turndownService.turndown(cleanHtml);

  // Step 4: Advanced cleaning to remove noise
  const cleanedMarkdown = cleanPageText(markdown);

  return {
    text: cleanedMarkdown,
    title: article.title || document.title,
    url: window.location.href,
    excerpt: article.excerpt || '',
    byline: article.byline || '',
    siteName: article.siteName || ''
  };
}

// Advanced text cleaner - removes common noise patterns
function cleanPageText(text) {
  return text
    // Remove excessive empty lines
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    
    // Remove markdown reference-style links [text]: url
    .replace(/^\[.*?\]:\s*https?:\/\/.*$/gm, '')
    
    // Remove standalone URLs (optional - be careful with code blocks)
    .replace(/^https?:\/\/\S+$/gm, '')
    
    // Remove common footer patterns
    .replace(/Copyright\s*©?\s*\d{4}.*/gi, '')
    .replace(/All rights reserved\.*/gi, '')
    .replace(/Terms (of Service|and Conditions).*/gi, '')
    .replace(/Privacy Policy.*/gi, '')
    
    // Remove "Share on" patterns
    .replace(/Share on (Twitter|Facebook|LinkedIn|Reddit).*/gi, '')
    .replace(/Tweet\s*\n/gi, '')
    
    // Remove "Related Articles" sections
    .replace(/#+\s*Related Articles?[\s\S]*?(?=\n#|\n\n---|\Z)/gi, '')
    .replace(/#+\s*You (Might|May) Also Like[\s\S]*?(?=\n#|\n\n---|\Z)/gi, '')
    .replace(/#+\s*More (Articles?|Stories)[\s\S]*?(?=\n#|\n\n---|\Z)/gi, '')
    
    // Remove "Comments" sections
    .replace(/#+\s*Comments?[\s\S]*?(?=\n#|\n\n---|\Z)/gi, '')
    
    // Remove email subscription prompts
    .replace(/Subscribe to (our|the) newsletter.*/gi, '')
    .replace(/Join \d+[,\d]* subscribers?.*/gi, '')
    
    // Remove navigation breadcrumbs
    .replace(/^(Home\s*[>›]\s*)+.*$/gm, '')
    
    // Remove "Last updated" timestamps (keep important dates in content)
    .replace(/Last updated:?\s*\w+\s+\d+,?\s+\d{4}/gi, '')
    
    // Remove multiple consecutive dashes/separators
    .replace(/[-_*]{3,}/g, '')
    
    // Collapse multiple spaces
    .replace(/  +/g, ' ')
    
    // Final cleanup: max 2 consecutive newlines
    .replace(/\n{3,}/g, '\n\n')
    
    .trim();
}

// Fallback extraction for pages where Readability fails
function fallbackExtraction() {
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
