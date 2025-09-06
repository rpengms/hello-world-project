const fs = require('fs').promises;
const path = require('path');

class TrainingDataService {
    constructor() {
        this.trainingDataPath = path.join(__dirname, '../../training-data');
        this.trainingFile = path.join(this.trainingDataPath, 'training_data.json');
        this.processedFile = path.join(this.trainingDataPath, 'processed_training_data.jsonl');
        this.metadataFile = path.join(this.trainingDataPath, 'metadata.json');
        
        this.initializeStorage();
    }

    /**
     * Initialize training data storage directory
     */
    async initializeStorage() {
        try {
            await fs.mkdir(this.trainingDataPath, { recursive: true });
        } catch (error) {
            console.error('Failed to initialize training data storage:', error);
        }
    }

    /**
     * Convert extracted debate cards to OpenAI fine-tuning format
     * @param {Array} cards - Array of debate card objects
     * @returns {Promise<Array>} Training data in OpenAI format
     */
    async convertCardsToTrainingData(cards) {
        const trainingExamples = [];

        for (const card of cards) {
            try {
                // Create multiple training examples from each card
                const examples = await this.generateTrainingExamples(card);
                trainingExamples.push(...examples);
            } catch (error) {
                console.error('Error converting card to training data:', error);
                // Continue with other cards
            }
        }

        return trainingExamples;
    }

    /**
     * Generate multiple training examples from a single card
     * @param {Object} card - Debate card object
     * @returns {Promise<Array>} Array of training examples
     */
    async generateTrainingExamples(card) {
        const examples = [];
        
        // Example 1: Full card formatting
        if (card.bodyText && card.formattedElements && card.formattedElements.length > 0) {
            examples.push(await this.createFormattingExample(card));
        }

        // Example 2: Partial formatting (for learning patterns)
        if (card.bodyText && card.bodyText.length > 100) {
            const partialCard = { ...card };
            partialCard.bodyText = card.bodyText.substring(0, Math.floor(card.bodyText.length * 0.6));
            examples.push(await this.createPartialFormattingExample(partialCard, card));
        }

        // Example 3: Context-aware formatting
        examples.push(await this.createContextAwareExample(card));

        return examples.filter(example => example !== null);
    }

    /**
     * Create full formatting training example
     * @param {Object} card - Debate card
     * @returns {Object} Training example
     */
    async createFormattingExample(card) {
        const systemPrompt = `You are an expert debate card formatter. Analyze the provided debate card text and determine the optimal formatting for competitive debate use. Focus on:

1. UNDERLINE: Key concepts, important terms, and crucial phrases that debaters need to quickly identify
2. EMPHASIS: Strong evidence, author conclusions, and critical arguments that carry significant weight
3. HIGHLIGHT: The most impactful claims, "smoking gun" quotes, and decisive evidence that could win arguments

Respond with a JSON object containing formatting instructions with precise text spans and positioning.`;

        const userPrompt = this.buildCardPrompt(card);
        const assistantResponse = this.buildFormattingResponse(card);

        return {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
                { role: 'assistant', content: assistantResponse }
            ],
            metadata: {
                cardId: card.id || this.generateCardId(card),
                tag: card.tag,
                source: card.cite,
                createdAt: new Date().toISOString(),
                type: 'full_formatting'
            }
        };
    }

    /**
     * Create partial formatting example for learning patterns
     * @param {Object} partialCard - Partial card content
     * @param {Object} fullCard - Full card with complete formatting
     * @returns {Object} Training example
     */
    async createPartialFormattingExample(partialCard, fullCard) {
        const systemPrompt = `You are a debate card formatting assistant. Given partial card text, predict the likely formatting patterns based on argument structure, evidence strength, and debate utility. Even with incomplete text, identify the most important elements that should be formatted.`;

        const userPrompt = this.buildCardPrompt(partialCard);
        
        // Create appropriate response based on available formatting in the partial text
        const relevantFormatting = this.extractRelevantFormatting(partialCard, fullCard);
        const assistantResponse = this.buildFormattingResponse({
            ...partialCard,
            formattedElements: relevantFormatting
        });

        return {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
                { role: 'assistant', content: assistantResponse }
            ],
            metadata: {
                cardId: this.generateCardId(partialCard),
                tag: partialCard.tag,
                source: partialCard.cite,
                createdAt: new Date().toISOString(),
                type: 'partial_formatting'
            }
        };
    }

    /**
     * Create context-aware formatting example
     * @param {Object} card - Debate card
     * @returns {Object} Training example
     */
    async createContextAwareExample(card) {
        const debateContext = this.inferDebateContext(card);
        
        const systemPrompt = `You are a specialized debate card formatter with expertise in ${debateContext.topic} arguments. Consider the debate context and argument type when making formatting decisions. Prioritize formatting that maximizes the card's utility in competitive debate rounds.`;

        const userPrompt = `${this.buildCardPrompt(card)}

Context: This appears to be ${debateContext.type} evidence for ${debateContext.topic} arguments. Format accordingly for maximum competitive debate utility.`;

        const assistantResponse = this.buildFormattingResponse(card, debateContext);

        return {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
                { role: 'assistant', content: assistantResponse }
            ],
            metadata: {
                cardId: this.generateCardId(card),
                tag: card.tag,
                source: card.cite,
                debateContext: debateContext,
                createdAt: new Date().toISOString(),
                type: 'context_aware_formatting'
            }
        };
    }

    /**
     * Build card prompt for training
     * @param {Object} card - Debate card
     * @returns {string} Formatted prompt
     */
    buildCardPrompt(card) {
        let prompt = `Please format this debate card:\n\n`;
        
        if (card.tag) {
            prompt += `TAG: ${card.tag}\n\n`;
        }
        
        if (card.cite) {
            prompt += `CITE: ${card.cite}\n\n`;
        }
        
        prompt += `BODY TEXT:\n${card.bodyText}\n\n`;
        prompt += `Provide formatting instructions as a JSON object with underline, emphasis, and highlight arrays.`;
        
        return prompt;
    }

    /**
     * Build formatting response based on card's existing formatting
     * @param {Object} card - Debate card with formatting
     * @param {Object} context - Optional debate context
     * @returns {string} JSON formatted response
     */
    buildFormattingResponse(card, context = null) {
        const response = {
            underline: [],
            emphasis: [],
            highlight: [],
            reasoning: ""
        };

        if (card.formattedElements) {
            for (const element of card.formattedElements) {
                const span = {
                    text: element.text,
                    start: element.startPosition || 0,
                    end: element.endPosition || element.text.length,
                    priority: element.priority || this.calculatePriority(element, card)
                };

                switch (element.type) {
                    case 'underline':
                        response.underline.push(span);
                        break;
                    case 'emphasis':
                    case 'em':
                    case 'strong':
                        response.emphasis.push(span);
                        break;
                    case 'highlight':
                    case 'mark':
                        response.highlight.push(span);
                        break;
                }
            }
        }

        // Generate reasoning
        response.reasoning = this.generateFormattingReasoning(card, response, context);

        return JSON.stringify(response, null, 2);
    }

    /**
     * Calculate formatting priority based on element characteristics
     * @param {Object} element - Formatting element
     * @param {Object} card - Parent card
     * @returns {number} Priority (1-5, 1 being highest)
     */
    calculatePriority(element, card) {
        let priority = 3; // Default medium priority

        // Higher priority for key debate terms
        const keyTerms = ['impact', 'uniqueness', 'link', 'internal link', 'solvency', 'evidence', 'proves', 'shows', 'demonstrates'];
        if (keyTerms.some(term => element.text.toLowerCase().includes(term))) {
            priority -= 1;
        }

        // Higher priority for statistical evidence
        if (/\d+%|\d+\s*(million|billion|trillion|percent)/.test(element.text)) {
            priority -= 1;
        }

        // Higher priority for strong conclusive language
        const strongLanguage = ['must', 'will', 'proves', 'confirms', 'establishes', 'critical', 'essential'];
        if (strongLanguage.some(word => element.text.toLowerCase().includes(word))) {
            priority -= 1;
        }

        return Math.max(1, Math.min(5, priority));
    }

    /**
     * Generate reasoning for formatting decisions
     * @param {Object} card - Debate card
     * @param {Object} formatting - Formatting response
     * @param {Object} context - Debate context
     * @returns {string} Reasoning text
     */
    generateFormattingReasoning(card, formatting, context) {
        const reasons = [];

        if (formatting.underline.length > 0) {
            reasons.push(`Underlined ${formatting.underline.length} key terms and concepts for quick identification during rounds`);
        }

        if (formatting.emphasis.length > 0) {
            reasons.push(`Emphasized ${formatting.emphasis.length} pieces of strong evidence and author conclusions`);
        }

        if (formatting.highlight.length > 0) {
            reasons.push(`Highlighted ${formatting.highlight.length} critical claims and impactful quotes`);
        }

        if (context) {
            reasons.push(`Formatting optimized for ${context.type} arguments in ${context.topic} debates`);
        }

        return reasons.join('. ') + '.';
    }

    /**
     * Extract relevant formatting elements from partial text
     * @param {Object} partialCard - Partial card
     * @param {Object} fullCard - Full card
     * @returns {Array} Relevant formatting elements
     */
    extractRelevantFormatting(partialCard, fullCard) {
        if (!fullCard.formattedElements || !partialCard.bodyText) {
            return [];
        }

        return fullCard.formattedElements.filter(element => {
            return partialCard.bodyText.includes(element.text);
        });
    }

    /**
     * Infer debate context from card content
     * @param {Object} card - Debate card
     * @returns {Object} Inferred context
     */
    inferDebateContext(card) {
        const context = {
            topic: 'general',
            type: 'evidence',
            urgency: 'medium'
        };

        const text = `${card.tag} ${card.cite} ${card.bodyText}`.toLowerCase();

        // Topic inference
        if (text.includes('climate') || text.includes('environment') || text.includes('warming')) {
            context.topic = 'climate change';
        } else if (text.includes('economic') || text.includes('gdp') || text.includes('market')) {
            context.topic = 'economics';
        } else if (text.includes('security') || text.includes('military') || text.includes('defense')) {
            context.topic = 'security';
        } else if (text.includes('health') || text.includes('medical') || text.includes('disease')) {
            context.topic = 'healthcare';
        }

        // Argument type inference
        if (text.includes('impact') || text.includes('consequence') || text.includes('result')) {
            context.type = 'impact';
        } else if (text.includes('cause') || text.includes('because') || text.includes('leads to')) {
            context.type = 'link';
        } else if (text.includes('solve') || text.includes('address') || text.includes('fix')) {
            context.type = 'solvency';
        }

        return context;
    }

    /**
     * Generate unique card ID
     * @param {Object} card - Card object
     * @returns {string} Unique ID
     */
    generateCardId(card) {
        const content = `${card.tag}_${card.cite}_${card.bodyText?.substring(0, 50)}`;
        return Buffer.from(content).toString('base64').substring(0, 16);
    }

    /**
     * Save training data to file
     * @param {Array} trainingData - Training examples
     * @returns {Promise} Save operation
     */
    async saveTrainingData(trainingData) {
        try {
            const existingData = await this.loadTrainingData();
            const combinedData = [...existingData, ...trainingData];
            
            await fs.writeFile(this.trainingFile, JSON.stringify(combinedData, null, 2));
            
            // Update metadata
            await this.updateMetadata({
                totalExamples: combinedData.length,
                lastUpdated: new Date().toISOString(),
                newExamplesAdded: trainingData.length
            });

            return combinedData;
        } catch (error) {
            throw new Error(`Failed to save training data: ${error.message}`);
        }
    }

    /**
     * Load existing training data
     * @returns {Promise<Array>} Existing training data
     */
    async loadTrainingData() {
        try {
            const data = await fs.readFile(this.trainingFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            if (error.code === 'ENOENT') {
                return []; // File doesn't exist yet
            }
            throw new Error(`Failed to load training data: ${error.message}`);
        }
    }

    /**
     * Prepare training data for OpenAI fine-tuning (JSONL format)
     * @param {Array} trainingData - Training examples
     * @returns {Promise<Array>} JSONL formatted data
     */
    async prepareForFineTuning(trainingData) {
        const processedData = trainingData.map(example => {
            // Ensure proper format for OpenAI API
            return {
                messages: example.messages.map(message => ({
                    role: message.role,
                    content: message.content
                }))
            };
        });

        // Save processed data
        const jsonlContent = processedData
            .map(example => JSON.stringify(example))
            .join('\n');
            
        await fs.writeFile(this.processedFile, jsonlContent);

        return processedData;
    }

    /**
     * Update metadata file
     * @param {Object} metadata - Metadata to update
     * @returns {Promise} Update operation
     */
    async updateMetadata(metadata) {
        try {
            const existing = await this.loadMetadata();
            const updated = { ...existing, ...metadata };
            await fs.writeFile(this.metadataFile, JSON.stringify(updated, null, 2));
        } catch (error) {
            console.error('Failed to update metadata:', error);
        }
    }

    /**
     * Load metadata
     * @returns {Promise<Object>} Metadata object
     */
    async loadMetadata() {
        try {
            const data = await fs.readFile(this.metadataFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return {
                totalExamples: 0,
                lastUpdated: null,
                version: '1.0.0'
            };
        }
    }

    /**
     * Validate training data quality
     * @param {Array} trainingData - Training data to validate
     * @returns {Object} Validation report
     */
    validateTrainingData(trainingData) {
        const report = {
            valid: true,
            errors: [],
            warnings: [],
            statistics: {
                totalExamples: trainingData.length,
                byType: {},
                averageTokens: 0,
                qualityScore: 0
            }
        };

        let totalTokens = 0;
        let qualityPoints = 0;

        for (const [index, example] of trainingData.entries()) {
            try {
                // Check required structure
                if (!example.messages || !Array.isArray(example.messages)) {
                    report.errors.push(`Example ${index}: Missing messages array`);
                    report.valid = false;
                    continue;
                }

                // Check message roles
                const roles = example.messages.map(m => m.role);
                if (!roles.includes('user') || !roles.includes('assistant')) {
                    report.errors.push(`Example ${index}: Missing required user/assistant roles`);
                    report.valid = false;
                }

                // Count tokens (rough estimation)
                const tokenCount = example.messages.reduce((sum, msg) => {
                    return sum + (msg.content?.length || 0) / 4; // Rough token estimate
                }, 0);
                totalTokens += tokenCount;

                // Quality scoring
                if (example.metadata?.type) {
                    report.statistics.byType[example.metadata.type] = 
                        (report.statistics.byType[example.metadata.type] || 0) + 1;
                }

                // Quality points for good examples
                if (tokenCount > 100 && tokenCount < 4000) qualityPoints += 2;
                if (example.messages.some(m => m.role === 'system')) qualityPoints += 1;
                if (example.metadata) qualityPoints += 1;

            } catch (error) {
                report.errors.push(`Example ${index}: Validation error - ${error.message}`);
                report.valid = false;
            }
        }

        report.statistics.averageTokens = Math.round(totalTokens / trainingData.length);
        report.statistics.qualityScore = Math.round((qualityPoints / (trainingData.length * 4)) * 100);

        // Add warnings
        if (trainingData.length < 10) {
            report.warnings.push('Less than 10 training examples - consider adding more for better results');
        }
        if (report.statistics.averageTokens > 3000) {
            report.warnings.push('High average token count - consider shorter examples for efficiency');
        }
        if (report.statistics.qualityScore < 60) {
            report.warnings.push('Low quality score - consider improving example structure and metadata');
        }

        return report;
    }

    /**
     * Export training data in various formats
     * @param {string} format - Export format (json, jsonl, csv)
     * @param {string} outputPath - Output file path
     * @returns {Promise} Export operation
     */
    async exportTrainingData(format = 'json', outputPath = null) {
        const data = await this.loadTrainingData();
        
        if (!outputPath) {
            outputPath = path.join(this.trainingDataPath, `export_${Date.now()}.${format}`);
        }

        let exportContent = '';

        switch (format) {
            case 'json':
                exportContent = JSON.stringify(data, null, 2);
                break;
            case 'jsonl':
                exportContent = data.map(example => JSON.stringify(example)).join('\n');
                break;
            case 'csv':
                exportContent = this.convertToCSV(data);
                break;
            default:
                throw new Error(`Unsupported export format: ${format}`);
        }

        await fs.writeFile(outputPath, exportContent);
        return outputPath;
    }

    /**
     * Convert training data to CSV format
     * @param {Array} data - Training data
     * @returns {string} CSV content
     */
    convertToCSV(data) {
        const headers = 'Index,Type,Tag,System_Message,User_Message,Assistant_Message,Created_At\n';
        
        const rows = data.map((example, index) => {
            const type = example.metadata?.type || 'unknown';
            const tag = example.metadata?.tag || '';
            const system = example.messages.find(m => m.role === 'system')?.content || '';
            const user = example.messages.find(m => m.role === 'user')?.content || '';
            const assistant = example.messages.find(m => m.role === 'assistant')?.content || '';
            const created = example.metadata?.createdAt || '';
            
            return [
                index,
                `"${type}"`,
                `"${tag.replace(/"/g, '""')}"`,
                `"${system.replace(/"/g, '""')}"`,
                `"${user.replace(/"/g, '""')}"`,
                `"${assistant.replace(/"/g, '""')}"`,
                `"${created}"`
            ].join(',');
        });
        
        return headers + rows.join('\n');
    }

    /**
     * Clean up training data files
     * @returns {Promise} Cleanup operation
     */
    async cleanup() {
        try {
            const files = [this.processedFile];
            await Promise.all(files.map(file => 
                fs.unlink(file).catch(() => {}) // Ignore errors
            ));
        } catch (error) {
            console.error('Cleanup failed:', error);
        }
    }
}

module.exports = TrainingDataService;