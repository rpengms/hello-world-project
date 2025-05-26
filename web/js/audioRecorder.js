// Remove ES module import and use the function directly from the global scope
document.addEventListener('DOMContentLoaded', () => {
    const recordButton = document.getElementById('recordButton');
    const recordIcon = document.getElementById('recordIcon');
    const recordingStatus = document.getElementById('recordingStatus');
    const transcriptionText = document.getElementById('transcriptionText');
    
    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;
    
    // Check if browser supports getUserMedia
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
        recordingStatus.textContent = 'Audio recording not supported in this browser';
        recordButton.disabled = true;
        return;
    }
    
    // Event listener for record button
    recordButton.addEventListener('click', async () => {
        if (!isRecording) {
            // Start recording
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                startRecording(stream);
            } catch (err) {
                console.error('Error accessing microphone:', err);
                recordingStatus.textContent = 'Error accessing microphone. Please check permissions.';
            }
        } else {
            // Stop recording
            stopRecording();
        }
    });
    
    function startRecording(stream) {
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.addEventListener('dataavailable', event => {
            audioChunks.push(event.data);
        });
        
        mediaRecorder.addEventListener('stop', () => {
            const audioBlob = new Blob(audioChunks);
            // Convert to proper WAV format with RIFF headers
            convertToWavFormat(audioBlob).then(wavBlob => {
                saveRecording(wavBlob);
            
                // Stop all tracks to release microphone
                stream.getTracks().forEach(track => track.stop());
            });
        });
        
        mediaRecorder.start();
        isRecording = true;
        
        // Update UI
        recordButton.classList.add('recording');
        recordIcon.classList.remove('fa-microphone');
        recordIcon.classList.add('fa-stop');
        recordingStatus.textContent = 'Recording... Click to stop';
    }
    
    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            isRecording = false;
            
            // Update UI
            recordButton.classList.remove('recording');
            recordIcon.classList.remove('fa-stop');
            recordIcon.classList.add('fa-microphone');
            recordingStatus.textContent = 'Processing recording...';
        }
    }
    
    function saveRecording(blob) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `recording-${timestamp}.wav`;
        
        // Create FormData to send the file to server
        const formData = new FormData();
        formData.append('audio', blob, filename);
        
        // Upload to Azure Blob Storage via backend API
        recordingStatus.textContent = 'Uploading recording...';
        
        console.log('Uploading audio file:', filename);
        fetch('/api/upload-audio', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('Upload successful:', data);
            recordingStatus.textContent = 'Recording uploaded successfully!';
            
            // Optionally display the URL where the file is stored
            if (data.url) {
                const uploadInfo = document.createElement('div');
                uploadInfo.innerHTML = `<a href="${data.url}" target="_blank">View uploaded audio</a>`;
                document.querySelector('.recording-container').appendChild(uploadInfo);
                
                // Start transcription process using the global transcribeAudio function
                if (data.localFileName && typeof window.transcriptionService !== 'undefined') {
                    const recordingContainer = document.querySelector('.recording-container');
                    result = window.transcriptionService.transcribeAudio(blob, data.localFileName, recordingStatus, transcriptionText);
                    console.log('Transcription result:', result);
                } else if (data.localFileName) {
                    console.error('Transcription service not loaded properly');
                    recordingStatus.textContent = 'Transcription service not available';
                }
            }
        })
        .catch(error => {
            console.error('Upload failed:', error);
            recordingStatus.textContent = 'Failed to upload recording. Please try again.';
        });
    }


});

// Function to convert raw audio data to WAV format with proper RIFF header
function convertToWavFormat(audioBlob) {
    return new Promise((resolve, reject) => {
        const fileReader = new FileReader();
        
        fileReader.onload = function(event) {
            const arrayBuffer = event.target.result;
            
            // Create audio context
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Decode the audio data
            audioContext.decodeAudioData(arrayBuffer, function(audioBuffer) {
                // Convert AudioBuffer to WAV
                const wavData = audioBufferToWav(audioBuffer);
                const wavBlob = new Blob([wavData], { type: 'audio/wav' });
                resolve(wavBlob);
            }, function(err) {
                console.error("Error decoding audio data", err);
                // If decoding fails, just use the original blob
                resolve(new Blob(audioChunks, { type: 'audio/wav' }));
            });
        };
        
        fileReader.onerror = function(error) {
            console.error("FileReader error", error);
            reject(error);
        };
        
        fileReader.readAsArrayBuffer(audioBlob);
    });
}

// Function to convert AudioBuffer to WAV format with RIFF header
function audioBufferToWav(audioBuffer) {
    const numOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM format
    const bitDepth = 16; // 16-bit
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numOfChannels * bytesPerSample;
    
    // Get the PCM data as a Float32Array for each channel
    const channelData = [];
    for (let channel = 0; channel < numOfChannels; channel++) {
        channelData.push(audioBuffer.getChannelData(channel));
    }
    
    // Calculate the total file size
    const dataSize = audioBuffer.length * numOfChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    // RIFF identifier
    writeString(view, 0, 'RIFF');
    // RIFF chunk size
    view.setUint32(4, 36 + dataSize, true);
    // RIFF type
    writeString(view, 8, 'WAVE');
    // Format chunk identifier
    writeString(view, 12, 'fmt ');
    // Format chunk size
    view.setUint32(16, 16, true);
    // Sample format (raw)
    view.setUint16(20, format, true);
    // Channel count
    view.setUint16(22, numOfChannels, true);
    // Sample rate
    view.setUint32(24, sampleRate, true);
    // Byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * blockAlign, true);
    // Block align
    view.setUint16(32, blockAlign, true);
    // Bits per sample
    view.setUint16(34, bitDepth, true);
    // Data chunk identifier
    writeString(view, 36, 'data');
    // Data chunk size
    view.setUint32(40, dataSize, true);
    
    // Write the PCM samples
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
        for (let channel = 0; channel < numOfChannels; channel++) {
            // Convert float to int
            let sample = Math.max(-1, Math.min(1, channelData[channel][i]));
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, sample, true);
            offset += bytesPerSample;
        }
    }
    
    return buffer;
}

// Helper function to write a string to a DataView
function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
