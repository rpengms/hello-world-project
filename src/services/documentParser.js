const mammoth = require('mammoth');
const fs = require('fs').promises;
const path = require('path');

class DocumentParser {
    constructor() {
        this.supportedFormats = ['.docx', '.doc'];
    }

    /**
     * Load and parse a Word document
     * @param {string} filePath - Path to the Word document
     * @returns {Object} Parsed document data
     */
    async loadDocument(filePath) {
        try {
            const fileExtension = path.extname(filePath).toLowerCase();
            
            if (!this.supportedFormats.includes(fileExtension)) {
                throw new Error(`Unsupported file format: ${fileExtension}`);
            }

            const fileBuffer = await fs.readFile(filePath);
            
            // Parse document with mammoth to extract both text and formatting
            const result = await mammoth.convertToHtml(fileBuffer, {
                convertImage: mammoth.images.ignoreAll,
                styleMap: [
                    "p[style-name='Heading 1'] => h1:fresh",
                    "p[style-name='Heading 2'] => h2:fresh",
                    "p[style-name='Tag'] => h3.tag:fresh",
                    "p[style-name='Cite'] => p.cite",
                    "r[style-name='Emphasis'] => em",
                    "r[style-name='Strong'] => strong"
                ]
            });

            const rawText = await mammoth.extractRawText(fileBuffer);

            return {
                filePath,
                fileName: path.basename(filePath),
                htmlContent: result.value,
                rawText: rawText.value,
                messages: result.messages,
                parsedAt: new Date().toISOString()
            };

        } catch (error) {
            throw new Error(`Failed to load document: ${error.message}`);
        }
    }

    /**
     * Extract debate cards from parsed document
     * @param {Object} document - Parsed document data
     * @returns {Array} Array of debate card objects
     */
    async extractDebateCards(document) {
        try {
            const cards = [];
            const html = document.htmlContent;
            
            // Split content by potential card boundaries
            // Look for patterns that indicate new cards (Tags, etc.)
            const cardBlocks = this.splitIntoCardBlocks(html);
            
            for (const block of cardBlocks) {
                const card = await this.parseCardBlock(block);
                if (card && this.isValidCard(card)) {
                    cards.push(card);
                }
            }

            return cards;
        } catch (error) {
            throw new Error(`Failed to extract debate cards: ${error.message}`);
        }
    }

    /**
     * Split HTML content into potential card blocks
     * @param {string} html - HTML content
     * @returns {Array} Array of HTML blocks
     */
    splitIntoCardBlocks(html) {
        // Look for headings (tags) as card delimiters
        const tagPattern = /<h[1-3][^>]*class="tag"[^>]*>.*?<\/h[1-3]>|<h[1-3][^>]*>.*?<\/h[1-3]>/gi;
        const blocks = [];
        
        let lastIndex = 0;
        let match;
        
        // Use regex to find tag patterns and split content
        const regex = new RegExp(tagPattern);
        
        while ((match = regex.exec(html)) !== null) {
            // Add content before this tag (if any)
            if (match.index > lastIndex) {
                const previousBlock = html.substring(lastIndex, match.index);
                if (previousBlock.trim()) {
                    blocks.push(previousBlock);
                }
            }
            
            // Find the end of this card (next tag or end of document)
            const nextTagMatch = regex.exec(html);
            const endIndex = nextTagMatch ? nextTagMatch.index : html.length;
            
            // Reset regex position to continue from where we left off
            regex.lastIndex = match.index;
            
            const cardBlock = html.substring(match.index, endIndex);
            blocks.push(cardBlock);
            
            lastIndex = endIndex;
            
            // Move to next iteration
            if (nextTagMatch) {
                regex.lastIndex = nextTagMatch.index;
            } else {
                break;
            }
        }
        
        // Add any remaining content
        if (lastIndex < html.length) {
            const remainingBlock = html.substring(lastIndex);
            if (remainingBlock.trim()) {
                blocks.push(remainingBlock);
            }
        }

        return blocks.filter(block => block.trim().length > 50); // Filter out very short blocks
    }

    /**
     * Parse individual card block to extract tag, cite, and body
     * @param {string} htmlBlock - HTML block containing card content
     * @returns {Object} Parsed card object
     */
    async parseCardBlock(htmlBlock) {
        try {
            const card = {
                tag: '',
                cite: '',
                bodyText: '',
                formattedElements: [],
                rawHtml: htmlBlock
            };

            // Extract tag (usually in h1, h2, h3, or .tag class)
            const tagMatch = htmlBlock.match(/<h[1-3][^>]*(?:class="tag"[^>]*)?>([^<]+)<\/h[1-3]>|<h[1-3][^>]*>([^<]+)<\/h[1-3]>/i);
            if (tagMatch) {
                card.tag = this.cleanText(tagMatch[1] || tagMatch[2]);
            }

            // Extract cite (usually in .cite class or specific formatting)
            const citeMatch = htmlBlock.match(/<p[^>]*class="cite"[^>]*>([^<]+(?:<[^>]+>[^<]*<\/[^>]+>[^<]*)*)<\/p>/i) ||
                             htmlBlock.match(/<p[^>]*><(?:strong|em|b|i)[^>]*>([^<]+)<\/(?:strong|em|b|i)>[^<]*(?:\d{4}|[A-Z][a-z]+)[^<]*<\/p>/i);
            
            if (citeMatch) {
                card.cite = this.cleanText(citeMatch[1]);
            }

            // Extract body text and formatting
            const bodyContent = this.extractBodyContent(htmlBlock);
            card.bodyText = bodyContent.text;
            card.formattedElements = bodyContent.elements;

            return card;
        } catch (error) {
            console.error('Error parsing card block:', error);
            return null;
        }
    }

    /**
     * Extract body content with formatting information
     * @param {string} htmlBlock - HTML block
     * @returns {Object} Body content with formatting data
     */
    extractBodyContent(htmlBlock) {
        const elements = [];
        let cleanText = '';
        
        // Remove tag and cite sections to focus on body
        let bodyHtml = htmlBlock.replace(/<h[1-3][^>]*>.*?<\/h[1-3]>/gi, '');
        bodyHtml = bodyHtml.replace(/<p[^>]*class="cite"[^>]*>.*?<\/p>/gi, '');
        
        // Extract formatted text elements
        const formattingPatterns = [
            { type: 'underline', regex: /<u[^>]*>(.*?)<\/u>/gi },
            { type: 'emphasis', regex: /<(?:em|i)[^>]*>(.*?)<\/(?:em|i)>/gi },
            { type: 'strong', regex: /<(?:strong|b)[^>]*>(.*?)<\/(?:strong|b)>/gi },
            { type: 'highlight', regex: /<mark[^>]*[^>]*>(.*?)<\/mark>/gi },
            { type: 'highlight', regex: /<span[^>]*background-color:\s*#[a-fA-F0-9]{6}[^>]*>(.*?)<\/span>/gi }
        ];

        let textPosition = 0;
        
        for (const pattern of formattingPatterns) {
            let match;
            while ((match = pattern.regex.exec(bodyHtml)) !== null) {
                const text = this.cleanText(match[1]);
                const startPos = cleanText.length + textPosition;
                
                elements.push({
                    type: pattern.type,
                    text: text,
                    startPosition: startPos,
                    endPosition: startPos + text.length,
                    htmlMatch: match[0]
                });
            }
        }

        // Clean text for body
        cleanText = this.cleanText(bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
        
        return {
            text: cleanText,
            elements: elements.sort((a, b) => a.startPosition - b.startPosition)
        };
    }

    /**
     * Clean extracted text by removing extra whitespace and HTML entities
     * @param {string} text - Raw text to clean
     * @returns {string} Cleaned text
     */
    cleanText(text) {
        if (!text) return '';
        
        return text
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Validate if extracted content represents a valid debate card
     * @param {Object} card - Card object to validate
     * @returns {boolean} True if valid card
     */
    isValidCard(card) {
        // A valid card should have at least a tag and some body text
        const hasTag = card.tag && card.tag.length > 2;
        const hasBody = card.bodyText && card.bodyText.length > 20;
        
        // Optional: Check for cite (some cards might not have clear cites)
        const hasSomeContent = card.cite || card.formattedElements.length > 0;
        
        return hasTag && hasBody && hasSomeContent;
    }

    /**
     * Get document statistics
     * @param {Object} document - Parsed document
     * @returns {Object} Document statistics
     */
    getDocumentStats(document) {
        return {
            fileName: document.fileName,
            totalCharacters: document.rawText.length,
            totalWords: document.rawText.split(/\s+/).length,
            totalParagraphs: (document.htmlContent.match(/<p[^>]*>/g) || []).length,
            parsedAt: document.parsedAt
        };
    }

    /**
     * Export cards to various formats
     * @param {Array} cards - Array of card objects
     * @param {string} format - Export format ('json', 'text', 'csv')
     * @returns {string} Formatted export data
     */
    exportCards(cards, format = 'json') {
        switch (format.toLowerCase()) {
            case 'json':
                return JSON.stringify(cards, null, 2);
                
            case 'text':
                return cards.map(card => {
                    let output = `TAG: ${card.tag}\n`;
                    if (card.cite) output += `CITE: ${card.cite}\n`;
                    output += `BODY: ${card.bodyText}\n`;
                    if (card.formattedElements.length > 0) {
                        output += `FORMATTING: ${card.formattedElements.length} elements\n`;
                    }
                    return output + '\n---\n';
                }).join('\n');
                
            case 'csv':
                const headers = 'Tag,Cite,Body Text,Formatted Elements Count\n';
                const rows = cards.map(card => {
                    const tag = `"${(card.tag || '').replace(/"/g, '""')}"`;
                    const cite = `"${(card.cite || '').replace(/"/g, '""')}"`;
                    const body = `"${(card.bodyText || '').replace(/"/g, '""')}"`;
                    const formatCount = card.formattedElements.length;
                    return `${tag},${cite},${body},${formatCount}`;
                }).join('\n');
                return headers + rows;
                
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }
    }
}

module.exports = DocumentParser;