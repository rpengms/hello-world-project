const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

class OpenAIService {
    constructor() {
        this.client = null;
        this.apiKey = null;
        this.currentModel = 'gpt-4';
        this.fineTunedModel = null;
        this.maxRetries = 3;
        this.retryDelay = 1000;
    }

    /**
     * Set the OpenAI API key
     * @param {string} apiKey - OpenAI API key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.client = new OpenAI({
            apiKey: apiKey
        });
    }

    /**
     * Set the model to use for API calls
     * @param {string} modelName - Model name (gpt-4, fine-tuned model, etc.)
     */
    setModel(modelName) {
        this.currentModel = modelName;
        if (modelName.startsWith('ft:')) {
            this.fineTunedModel = modelName;
        }
    }

    /**
     * Test connection to OpenAI API
     * @returns {Promise<boolean>} True if connection successful
     */
    async testConnection() {
        if (!this.client) {
            throw new Error('API key not set');
        }

        try {
            const response = await this.client.models.list();
            return response.data.length > 0;
        } catch (error) {
            throw new Error(`API connection failed: ${error.message}`);
        }
    }

    /**
     * Get formatting suggestions for a debate card
     * @param {Object} cardContent - Card content with tag, cite, and body text
     * @returns {Promise<Object>} Formatting instructions
     */
    async getCardFormatting(cardContent) {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        const model = this.fineTunedModel || this.currentModel;
        
        const prompt = this.buildFormattingPrompt(cardContent);
        
        try {
            const response = await this.client.chat.completions.create({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: `You are an expert debate card formatter. Your task is to analyze debate card text and provide precise formatting instructions for underlining key concepts, emphasizing critical arguments, and highlighting the most important claims. 

Format your response as a JSON object with:
- "underline": array of text spans that should be underlined
- "emphasis": array of text spans that need emphasis/italics  
- "highlight": array of text spans that should be highlighted in light blue
- "reasoning": brief explanation of formatting decisions

Each text span should include:
- "text": the exact text to format
- "start": character position where formatting begins
- "end": character position where formatting ends
- "priority": formatting priority (1=highest, 5=lowest)

Focus on:
- Underline: Key terms, concepts, and important phrases
- Emphasis: Critical arguments, strong evidence, author conclusions
- Highlight: Most impactful claims, smoking gun quotes, key statistics`
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 1500
            });

            const result = response.choices[0]?.message?.content;
            if (!result) {
                throw new Error('No response from OpenAI API');
            }

            return this.parseFormattingResponse(result);
        } catch (error) {
            if (error.status === 429) {
                // Rate limit - retry with backoff
                await this.sleep(this.retryDelay);
                return this.getCardFormatting(cardContent);
            }
            throw new Error(`Card formatting failed: ${error.message}`);
        }
    }

    /**
     * Build prompt for card formatting
     * @param {Object} cardContent - Card content
     * @returns {string} Formatted prompt
     */
    buildFormattingPrompt(cardContent) {
        return `Please analyze this debate card and provide formatting instructions:

TAG: ${cardContent.tag || 'N/A'}

CITE: ${cardContent.cite || 'N/A'}

BODY TEXT:
${cardContent.bodyText || cardContent.text || ''}

Please provide formatting instructions in the specified JSON format, focusing on the body text primarily. Consider the debate context and argument structure when making formatting decisions.`;
    }

    /**
     * Parse OpenAI formatting response
     * @param {string} responseText - Raw response from OpenAI
     * @returns {Object} Parsed formatting instructions
     */
    parseFormattingResponse(responseText) {
        try {
            // Try to parse JSON response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }

            // Fallback: parse structured text response
            return this.parseStructuredResponse(responseText);
        } catch (error) {
            console.warn('Failed to parse formatting response:', error);
            return {
                underline: [],
                emphasis: [],
                highlight: [],
                reasoning: 'Failed to parse formatting instructions'
            };
        }
    }

    /**
     * Parse non-JSON structured response
     * @param {string} text - Response text
     * @returns {Object} Parsed formatting data
     */
    parseStructuredResponse(text) {
        const result = {
            underline: [],
            emphasis: [],
            highlight: [],
            reasoning: ''
        };

        // Extract different formatting sections
        const underlineMatch = text.match(/underline:?\s*\[([^\]]*)\]/i);
        const emphasisMatch = text.match(/emphasis:?\s*\[([^\]]*)\]/i);
        const highlightMatch = text.match(/highlight:?\s*\[([^\]]*)\]/i);
        const reasoningMatch = text.match(/reasoning:?\s*"?([^"]*)"?/i);

        if (underlineMatch) result.underline = this.parseTextSpans(underlineMatch[1]);
        if (emphasisMatch) result.emphasis = this.parseTextSpans(emphasisMatch[1]);
        if (highlightMatch) result.highlight = this.parseTextSpans(highlightMatch[1]);
        if (reasoningMatch) result.reasoning = reasoningMatch[1].trim();

        return result;
    }

    /**
     * Parse text spans from response
     * @param {string} spanText - Text containing spans
     * @returns {Array} Array of text span objects
     */
    parseTextSpans(spanText) {
        const spans = [];
        const spanMatches = spanText.match(/"([^"]+)"/g);
        
        if (spanMatches) {
            spanMatches.forEach((match, index) => {
                const text = match.replace(/"/g, '');
                spans.push({
                    text: text,
                    priority: index + 1
                });
            });
        }

        return spans;
    }

    /**
     * Upload training data file to OpenAI
     * @param {Array} trainingData - Array of training examples
     * @returns {Promise<string>} File ID
     */
    async uploadTrainingFile(trainingData) {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        try {
            // Convert training data to JSONL format
            const jsonlContent = trainingData
                .map(example => JSON.stringify(example))
                .join('\n');

            // Write to temporary file
            const tempFilePath = path.join(__dirname, '../../training-data/training_data.jsonl');
            await fs.writeFile(tempFilePath, jsonlContent);

            // Upload file
            const fileResponse = await this.client.files.create({
                file: await fs.readFile(tempFilePath),
                purpose: 'fine-tune'
            });

            // Clean up temp file
            await fs.unlink(tempFilePath).catch(() => {}); // Ignore errors

            return fileResponse.id;
        } catch (error) {
            throw new Error(`File upload failed: ${error.message}`);
        }
    }

    /**
     * Start fine-tuning job
     * @param {string} fileId - Training file ID
     * @param {Object} options - Fine-tuning options
     * @returns {Promise<string>} Job ID
     */
    async startFineTuning(fileId, options = {}) {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        try {
            const fineTuningJob = await this.client.fineTuning.jobs.create({
                training_file: fileId,
                model: options.baseModel || 'gpt-4o-mini',
                hyperparameters: {
                    n_epochs: options.epochs || 3,
                    batch_size: options.batchSize || 8,
                    learning_rate_multiplier: options.learningRate || 0.1
                },
                suffix: options.suffix || 'mba-debate-bot'
            });

            return fineTuningJob.id;
        } catch (error) {
            throw new Error(`Fine-tuning failed to start: ${error.message}`);
        }
    }

    /**
     * Get fine-tuning job status
     * @param {string} jobId - Fine-tuning job ID
     * @returns {Promise<Object>} Job status information
     */
    async getFineTuningStatus(jobId) {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        try {
            const job = await this.client.fineTuning.jobs.retrieve(jobId);
            return {
                status: job.status,
                finishedAt: job.finished_at,
                fineTunedModel: job.fine_tuned_model,
                trainingFiles: job.training_file,
                resultFiles: job.result_files,
                trainedTokens: job.trained_tokens,
                error: job.error
            };
        } catch (error) {
            throw new Error(`Failed to get job status: ${error.message}`);
        }
    }

    /**
     * List all fine-tuning jobs
     * @returns {Promise<Array>} List of fine-tuning jobs
     */
    async listFineTuningJobs() {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        try {
            const jobs = await this.client.fineTuning.jobs.list();
            return jobs.data;
        } catch (error) {
            throw new Error(`Failed to list fine-tuning jobs: ${error.message}`);
        }
    }

    /**
     * Test the fine-tuned model
     * @param {string} testText - Text to test with
     * @returns {Promise<string>} Model response
     */
    async testModel(testText) {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        const model = this.fineTunedModel || this.currentModel;

        try {
            const response = await this.client.chat.completions.create({
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a debate card formatting expert. Analyze the provided text and suggest formatting.'
                    },
                    {
                        role: 'user',
                        content: testText
                    }
                ],
                max_tokens: 500,
                temperature: 0.3
            });

            return response.choices[0]?.message?.content || 'No response';
        } catch (error) {
            throw new Error(`Model test failed: ${error.message}`);
        }
    }

    /**
     * Validate training data format
     * @param {Array} trainingData - Training data to validate
     * @returns {Object} Validation results
     */
    validateTrainingData(trainingData) {
        const errors = [];
        const warnings = [];

        if (!Array.isArray(trainingData)) {
            errors.push('Training data must be an array');
            return { valid: false, errors, warnings };
        }

        if (trainingData.length < 10) {
            warnings.push('Training data should have at least 10 examples for good results');
        }

        trainingData.forEach((example, index) => {
            if (!example.messages || !Array.isArray(example.messages)) {
                errors.push(`Example ${index}: missing or invalid 'messages' array`);
                return;
            }

            const hasSystem = example.messages.some(msg => msg.role === 'system');
            const hasUser = example.messages.some(msg => msg.role === 'user');
            const hasAssistant = example.messages.some(msg => msg.role === 'assistant');

            if (!hasUser) errors.push(`Example ${index}: missing user message`);
            if (!hasAssistant) errors.push(`Example ${index}: missing assistant message`);
            if (!hasSystem) warnings.push(`Example ${index}: missing system message (recommended)`);
        });

        return {
            valid: errors.length === 0,
            errors,
            warnings,
            exampleCount: trainingData.length
        };
    }

    /**
     * Get model usage and costs
     * @returns {Promise<Object>} Usage statistics
     */
    async getUsageStats() {
        if (!this.client) {
            throw new Error('OpenAI client not initialized');
        }

        try {
            // This would typically require additional API endpoints
            // For now, return basic info
            return {
                currentModel: this.currentModel,
                fineTunedModel: this.fineTunedModel,
                apiKeySet: !!this.apiKey,
                clientInitialized: !!this.client
            };
        } catch (error) {
            throw new Error(`Failed to get usage stats: ${error.message}`);
        }
    }

    /**
     * Sleep for specified milliseconds
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Retry failed API calls with exponential backoff
     * @param {Function} operation - Async operation to retry
     * @param {number} maxRetries - Maximum retry attempts
     * @returns {Promise} Operation result
     */
    async retryOperation(operation, maxRetries = this.maxRetries) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                
                if (attempt < maxRetries) {
                    const delay = this.retryDelay * Math.pow(2, attempt - 1);
                    console.log(`Retry attempt ${attempt} failed, waiting ${delay}ms...`);
                    await this.sleep(delay);
                } else {
                    console.log(`All ${maxRetries} retry attempts failed`);
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Clean up resources
     */
    cleanup() {
        this.client = null;
        this.apiKey = null;
    }
}

module.exports = OpenAIService;