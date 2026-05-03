const pdf = require('pdf-parse');
const axios = require('axios');

/**
 * Download a file from a URL and return it as a Buffer.
 */
async function downloadBuffer(url) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000
  });
  return Buffer.from(response.data);
}

/**
 * Extract plain text from a PDF given either a Buffer or a URL.
 *
 * @param {Buffer|string} source  – Buffer containing PDF data, or a URL string
 * @returns {string}              – Extracted text
 */
async function extractPdfText(source) {
  let buffer;

  if (typeof source === 'string') {
    // Treat as URL
    buffer = await downloadBuffer(source);
  } else if (Buffer.isBuffer(source)) {
    buffer = source;
  } else {
    throw new Error('extractPdfText requires a Buffer or a URL string.');
  }

  const data = await pdf(buffer);

  if (!data.text || data.text.trim().length === 0) {
    throw new Error('Could not extract any text from the PDF. The file may be scanned or image-based.');
  }

  // Clean up excessive whitespace while preserving paragraph breaks
  const cleaned = data.text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return cleaned;
}

module.exports = { extractPdfText };

