const { ipcRenderer } = require('electron');
const path = require('path');

// Import services
const DocumentParser = require('../services/documentParser');
const OpenAIService = require('../services/openaiService');
const TrainingDataService = require('../services/trainingDataService');
const WordMacroService = require('../services/wordMacroService');

class MBADebateBotApp {
    constructor() {
        this.documentParser = new DocumentParser();
        this.openaiService = new OpenAIService();
        this.trainingDataService = new TrainingDataService();
        this.wordMacroService = new WordMacroService();
        
        this.currentDocument = null;
        this.trainingData = [];
        this.isProcessing = false;
        
        this.initializeEventListeners();
        this.checkServiceStatus();
        this.loadConfiguration();
    }

    initializeEventListeners() {
        // UI Button Events
        document.getElementById('openDocument').addEventListener('click', () => this.openDocument());
        document.getElementById('scanDocument').addEventListener('click', () => this.scanDocument());
        document.getElementById('cutCard').addEventListener('click', () => this.cutCard());
        document.getElementById('startTraining').addEventListener('click', () => this.startTraining());
        document.getElementById('viewTrainingData').addEventListener('click', () => this.viewTrainingData());
        document.getElementById('testModel').addEventListener('click', () => this.testModel());
        document.getElementById('openSettings').addEventListener('click', () => this.openSettings());
        document.getElementById('viewLogs').addEventListener('click', () => this.viewLogs());
        document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());

        // Menu Events from Main Process
        ipcRenderer.on('menu-open-document', () => this.openDocument());
        ipcRenderer.on('menu-scan-document', () => this.scanDocument());
        ipcRenderer.on('menu-start-finetuning', () => this.startTraining());
        ipcRenderer.on('menu-cut-card', () => this.cutCard());
        ipcRenderer.on('menu-test-word', () => this.testWordIntegration());
        ipcRenderer.on('menu-open-settings', () => this.openSettings());

        // Window Events
        window.addEventListener('beforeunload', () => this.cleanup());
    }

    async openDocument() {
        if (this.isProcessing) {
            this.showMessage('Please wait for current operation to complete.', 'warning');
            return;
        }

        try {
            const result = await ipcRenderer.invoke('dialog-open-file', {
                title: 'Select Word Document',
                filters: [
                    { name: 'Word Documents', extensions: ['docx', 'doc'] }
                ]
            });

            if (!result.canceled && result.filePaths.length > 0) {
                const filePath = result.filePaths[0];
                this.log(`Opening document: ${path.basename(filePath)}`);
                
                this.showProcessingScreen('Opening Document', 'Reading document content...');
                this.updateProgress(25);
                
                this.currentDocument = await this.documentParser.loadDocument(filePath);
                this.updateProgress(100);
                
                this.log(`Document loaded successfully. Found ${this.currentDocument.cards?.length || 0} potential cards.`);
                this.showMessage(`Document loaded: ${path.basename(filePath)}`, 'success');
                this.hideProcessingScreen();
                
                // Update Word integration status
                this.updateStatus('wordStatus', 'connected');
            }
        } catch (error) {
            this.handleError('Failed to open document', error);
            this.hideProcessingScreen();
        }
    }

    async scanDocument() {
        if (!this.currentDocument) {
            this.showMessage('Please open a Word document first.', 'warning');
            return;
        }

        if (this.isProcessing) {
            this.showMessage('Please wait for current operation to complete.', 'warning');
            return;
        }

        try {
            this.isProcessing = true;
            this.showProcessingScreen('Scanning Document', 'Analyzing document structure...');
            this.updateProgress(0);

            // Parse debate cards from document
            const cards = await this.documentParser.extractDebateCards(this.currentDocument);
            this.updateProgress(50);

            // Convert to training format
            const trainingData = await this.trainingDataService.convertCardsToTrainingData(cards);
            this.updateProgress(75);

            // Save training data
            await this.trainingDataService.saveTrainingData(trainingData);
            this.updateProgress(100);

            this.trainingData = [...this.trainingData, ...trainingData];
            this.log(`Extracted ${cards.length} cards and converted to training data.`);
            
            // Update UI
            document.getElementById('trainingDataCount').textContent = this.trainingData.length;
            this.showMessage(`Scanned ${cards.length} debate cards successfully!`, 'success');
            
            this.hideProcessingScreen();
        } catch (error) {
            this.handleError('Failed to scan document', error);
            this.hideProcessingScreen();
        } finally {
            this.isProcessing = false;
        }
    }

    async cutCard() {
        if (!this.currentDocument) {
            this.showMessage('Please open a Word document first.', 'warning');
            return;
        }

        try {
            this.showProcessingScreen('Cutting Card', 'Analyzing current card...');
            this.updateProgress(25);

            // Get current card content from Word
            const currentCard = await this.wordMacroService.getCurrentCard();
            this.updateProgress(50);

            // Use AI to determine formatting
            const formattingInstructions = await this.openaiService.getCardFormatting(currentCard);
            this.updateProgress(75);

            // Apply formatting to Word document
            await this.wordMacroService.applyFormatting(formattingInstructions);
            this.updateProgress(100);

            this.log('Card formatting applied successfully.');
            this.showMessage('Card cut successfully!', 'success');
            this.hideProcessingScreen();
        } catch (error) {
            this.handleError('Failed to cut card', error);
            this.hideProcessingScreen();
        }
    }

    async startTraining() {
        if (this.trainingData.length === 0) {
            this.showMessage('No training data available. Please scan documents first.', 'warning');
            return;
        }

        try {
            this.showTrainingScreen();
            this.log('Starting fine-tuning process...');
            
            document.getElementById('modelTrainingStatus').textContent = 'Preparing training data...';
            this.updateTrainingProgress(10);

            // Prepare training data for OpenAI
            const formattedData = await this.trainingDataService.prepareForFineTuning(this.trainingData);
            this.updateTrainingProgress(25);

            // Upload training file
            document.getElementById('modelTrainingStatus').textContent = 'Uploading training data...';
            const fileId = await this.openaiService.uploadTrainingFile(formattedData);
            this.updateTrainingProgress(50);

            // Start fine-tuning job
            document.getElementById('modelTrainingStatus').textContent = 'Starting fine-tuning job...';
            const jobId = await this.openaiService.startFineTuning(fileId);
            this.updateTrainingProgress(75);

            // Monitor training progress
            document.getElementById('modelTrainingStatus').textContent = 'Training in progress...';
            await this.monitorTrainingProgress(jobId);
            
            this.updateTrainingProgress(100);
            document.getElementById('modelTrainingStatus').textContent = 'Training completed successfully!';
            this.updateStatus('modelStatus', 'connected');
            
            this.log('Fine-tuning completed successfully.');
        } catch (error) {
            this.handleError('Training failed', error);
            document.getElementById('modelTrainingStatus').textContent = 'Training failed';
        }
    }

    async monitorTrainingProgress(jobId) {
        return new Promise((resolve, reject) => {
            const checkProgress = async () => {
                try {
                    const status = await this.openaiService.getFineTuningStatus(jobId);
                    this.log(`Training status: ${status.status}`);
                    
                    if (status.status === 'succeeded') {
                        resolve(status);
                    } else if (status.status === 'failed') {
                        reject(new Error('Training job failed'));
                    } else {
                        // Continue monitoring
                        setTimeout(checkProgress, 10000); // Check every 10 seconds
                    }
                } catch (error) {
                    reject(error);
                }
            };
            
            checkProgress();
        });
    }

    async testModel() {
        try {
            const testResult = await this.openaiService.testModel("This is a test debate card about economic policy.");
            this.log('Model test result:', testResult);
            this.showMessage('Model test completed successfully!', 'success');
        } catch (error) {
            this.handleError('Model test failed', error);
        }
    }

    async testWordIntegration() {
        try {
            this.log('Testing Word integration...');
            const result = await this.wordMacroService.testConnection();
            if (result.success) {
                this.updateStatus('wordStatus', 'connected');
                this.showMessage('Word integration test successful!', 'success');
            } else {
                this.updateStatus('wordStatus', 'disconnected');
                this.showMessage('Word integration test failed.', 'error');
            }
        } catch (error) {
            this.updateStatus('wordStatus', 'disconnected');
            this.handleError('Word integration test failed', error);
        }
    }

    async checkServiceStatus() {
        // Check OpenAI API status
        try {
            await this.openaiService.testConnection();
            this.updateStatus('apiStatus', 'connected');
        } catch (error) {
            this.updateStatus('apiStatus', 'disconnected');
        }

        // Check Word integration status
        try {
            const result = await this.wordMacroService.testConnection();
            this.updateStatus('wordStatus', result.success ? 'connected' : 'disconnected');
        } catch (error) {
            this.updateStatus('wordStatus', 'disconnected');
        }

        // Check model status
        const modelName = localStorage.getItem('modelName');
        if (modelName) {
            this.updateStatus('modelStatus', 'connected');
        }
    }

    async loadConfiguration() {
        const apiKey = localStorage.getItem('openaiApiKey');
        const modelName = localStorage.getItem('modelName');
        
        if (apiKey) {
            document.getElementById('apiKey').value = apiKey;
            this.openaiService.setApiKey(apiKey);
        }
        
        if (modelName) {
            document.getElementById('modelName').value = modelName;
            this.openaiService.setModel(modelName);
        }

        // Load training data count
        const trainingData = await this.trainingDataService.loadTrainingData();
        this.trainingData = trainingData;
        document.getElementById('trainingDataCount').textContent = trainingData.length;
    }

    async saveSettings() {
        const apiKey = document.getElementById('apiKey').value.trim();
        const modelName = document.getElementById('modelName').value.trim();

        if (apiKey) {
            localStorage.setItem('openaiApiKey', apiKey);
            this.openaiService.setApiKey(apiKey);
        }

        if (modelName) {
            localStorage.setItem('modelName', modelName);
            this.openaiService.setModel(modelName);
        }

        this.showMessage('Settings saved successfully!', 'success');
        await this.checkServiceStatus();
    }

    // UI Helper Methods
    showScreen(screenId) {
        // Hide all screens
        document.querySelectorAll('.content-card').forEach(card => {
            card.classList.add('hidden');
        });
        
        // Show specific screen
        document.getElementById(screenId).classList.remove('hidden');
    }

    showProcessingScreen(title, status) {
        document.querySelector('#processingScreen h3').textContent = title;
        document.getElementById('processingStatus').textContent = status;
        this.showScreen('processingScreen');
    }

    hideProcessingScreen() {
        this.showScreen('welcomeScreen');
    }

    showTrainingScreen() {
        this.showScreen('trainingScreen');
    }

    openSettings() {
        this.showScreen('settingsScreen');
    }

    updateProgress(percentage) {
        document.getElementById('progressFill').style.width = `${percentage}%`;
    }

    updateTrainingProgress(percentage) {
        document.getElementById('trainingProgress').style.width = `${percentage}%`;
    }

    updateStatus(elementId, status) {
        const element = document.getElementById(elementId);
        element.className = `status-indicator status-${status}`;
    }

    log(message, data = null) {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[${timestamp}] ${message}`;
        console.log(logMessage, data);
        
        // Add to processing log if visible
        const processingLog = document.getElementById('processingLog');
        const trainingLog = document.getElementById('trainingLog');
        
        if (!processingLog.classList.contains('hidden')) {
            processingLog.innerHTML += `<div>${logMessage}</div>`;
            processingLog.scrollTop = processingLog.scrollHeight;
        }
        
        if (!trainingLog.classList.contains('hidden')) {
            trainingLog.innerHTML += `<div>${logMessage}</div>`;
            trainingLog.scrollTop = trainingLog.scrollHeight;
        }
    }

    showMessage(message, type = 'info') {
        // Could implement a toast notification system here
        console.log(`${type.toUpperCase()}: ${message}`);
        
        // For now, use simple alert for important messages
        if (type === 'error') {
            alert(`Error: ${message}`);
        }
    }

    handleError(message, error) {
        console.error(message, error);
        this.log(`ERROR: ${message} - ${error.message}`);
        this.showMessage(`${message}: ${error.message}`, 'error');
    }

    viewTrainingData() {
        if (this.trainingData.length === 0) {
            this.showMessage('No training data available.', 'warning');
            return;
        }
        
        // Could implement a detailed training data viewer here
        this.log(`Training data contains ${this.trainingData.length} examples.`);
        this.showMessage(`Training data: ${this.trainingData.length} examples available.`, 'info');
    }

    viewLogs() {
        // Could implement a detailed log viewer here
        this.log('Log viewer opened.');
    }

    cleanup() {
        // Cleanup resources when app is closing
        if (this.wordMacroService) {
            this.wordMacroService.cleanup();
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new MBADebateBotApp();
});

// Handle uncaught errors
window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error);
    if (window.app) {
        window.app.handleError('Uncaught application error', event.error);
    }
});