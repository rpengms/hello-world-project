const express = require('express');
const multer = require('multer');
const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

// Middleware for parsing JSON and url-encoded form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'web' directory
app.use(express.static(path.join(__dirname, 'web')));

// Set up multer for handling file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Azure Storage connection string from environment variables
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'audiorecordings';

// Azure Speech Service configuration
const speechKey = process.env.AZURE_SPEECH_KEY;
const speechRegion = process.env.AZURE_SPEECH_REGION || 'eastus';

// API endpoint for audio uploads
app.post('/api/upload-audio', upload.single('audio'), async (req, res) => {
    try {
        console.log('Received audio file:', req.file.originalname);
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        if (!connectionString) {
            return res.status(500).json({ error: 'Azure Storage connection string not configured' });
        }

        // Create the BlobServiceClient object
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        
        // Get a reference to a container
        const containerClient = blobServiceClient.getContainerClient(containerName);
        
        // Create the container if it doesn't exist
        try {
            await containerClient.createIfNotExists({ access: 'blob' });
        } catch (error) {
            console.log(`Container may already exist: ${error.message}`);
        }

        // Generate unique blob name
        const blobName = `${Date.now()}-${req.file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        console.log(`Uploading audio file ${blobName} to Azure Blob storage...`);
        
        // Upload data to the blob
        const uploadResponse = await blockBlobClient.upload(
            req.file.buffer,
            req.file.buffer.length
        );

        console.log(`Audio file uploaded successfully, ETag: ${uploadResponse.etag}`);
        
        // Return the URL to the uploaded blob
        res.status(200).json({
            message: 'Audio file uploaded successfully',
            localFileName: req.file.originalname,
            blobName: blobName,
            url: blockBlobClient.url
        });
    } catch (error) {
        console.error('Error uploading to Azure Blob Storage:', error);
        res.status(500).json({
            error: 'Failed to upload audio file',
            details: error.message
        });
    }
});

// API endpoint for transcribing audio files
app.post('/api/transcribe-audio', upload.single('audio'), async (req, res) => {
    try {

        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }

        if (!speechKey) {
            return res.status(500).json({ error: 'Azure Speech Service key not configured' });
        }

        if (!connectionString) {
            return res.status(500).json({ error: 'Azure Storage connection string not configured' });
        }

        console.log('Attempting to transcribe blob:', req.file.originalname);

        // Configure speech recognition
        const audioConfig = sdk.AudioConfig.fromWavFileInput(req.file.buffer);
        const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);
        
        // Optional: Set the recognition language (default is US English)
        speechConfig.speechRecognitionLanguage = "en-US";
        
        // Create the speech recognizer
        const recognizer = new sdk.SpeechRecognizer(speechConfig, audioConfig);

        // Start the transcription process
        console.log('Starting transcription process...');
        
        // Instead of responding within the callback, we'll create a Promise that resolves
        // when the recognition is complete
        await new Promise((resolve, reject) => {
            recognizer.recognizeOnceAsync(
                function(result) {
                    // Close the recognizer
                    recognizer.close();
                    
                    console.log(`Transcription result: ${result.text}`);
                    
                    if (result.reason === sdk.ResultReason.RecognizedSpeech) {
                        res.status(200).json({
                            success: true,
                            transcription: result.text,
                            text: result.text // Include both for compatibility
                        });
                        resolve(); // Resolve the promise to continue
                    } else {
                        const errorMsg = `Speech recognition failed: ${result.reason}`;
                        console.error(errorMsg);
                        res.status(400).json({
                            success: false,
                            error: errorMsg,
                            reasonCode: result.reason
                        });
                        resolve(); // Resolve even in case of recognition failure
                    }
                },
                function(err) {
                    recognizer.close();
                    console.error(`ERROR: ${err}`);
                    res.status(500).json({
                        success: false,
                        error: `Transcription error: ${err}`
                    });
                    reject(err); // Reject the promise on error
                }
            );
        });
        
        console.log('Transcription process completed.');
    } catch (error) {
        console.error('Error in transcription process:', error);
        res.status(500).json({
            success: false,
            error: `Failed to transcribe audio file: ${error.message}`
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
