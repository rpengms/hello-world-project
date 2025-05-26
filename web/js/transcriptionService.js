/**
 * Transcription service for audio files
 * Communicates with Azure Speech Services via backend API
 */

// Create a global namespace for the transcription service
window.transcriptionService = window.transcriptionService || {};

/**
 * Transcribe an audio file stored in Azure Blob Storage
 * @param {string} blobName - The name of the blob in Azure Storage
 * @param {HTMLElement} statusElement - Element to update with transcription status
 * @param {HTMLElement} transcriptionElement - Element to update transcription results
 * @returns {Promise} - Promise resolving to the transcription data
 */
window.transcriptionService.transcribeAudio = function(blob, blobName, statusElement, transcriptionElement) {
    statusElement.textContent = 'Transcribing audio...';

    // Create FormData to send the file to server
    const formData = new FormData();
    formData.append('audio', blob, blobName);
    
    return fetch('/api/transcribe-audio', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Transcription request failed');
        }
        return response.json();
    })
    .then(data => {
        console.log('Transcription successful:', data);
        statusElement.textContent = 'Transcription completed!';
        
        // Display the transcription result - handle both response formats from server
        const transcriptionText = data.transcription || data.text || '';
        if (transcriptionText && transcriptionText.trim() !== '') {
            transcriptionElement.innerHTML = `
                <h3>Transcription:</h3>
                <div class="transcription-text">${transcriptionText}</div>
            `;
        } else {
            statusElement.textContent = 'Transcription completed but no text was recognized.';
        }
        
        return data;
    })
    .catch(error => {
        console.error('Transcription failed:', error);
        statusElement.textContent = 'Failed to transcribe audio. Please try again.';
        throw error;
    });
};



