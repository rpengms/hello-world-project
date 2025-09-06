const express = require('express');
const multer = require('multer');
const { BlobServiceClient } = require('@azure/storage-blob');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sdk = require('microsoft-cognitiveservices-speech-sdk');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// JWT secret key (add to .env in production)
const JWT_SECRET = process.env.JWT_SECRET || 'dyslexia-app-secret-key-change-in-production';

// Initialize SQLite Database
const dbPath = path.join(__dirname, 'dyslexia_app.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initializeDatabase();
    }
});

// Create database tables
function initializeDatabase() {
    const tables = [
        // Users table
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email VARCHAR(255) UNIQUE NOT NULL,
            username VARCHAR(100) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            name VARCHAR(255),
            age INTEGER,
            grade_level VARCHAR(50),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            email_verified BOOLEAN DEFAULT FALSE
        )`,
        
        // Game sessions table
        `CREATE TABLE IF NOT EXISTS game_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            game_type VARCHAR(50) NOT NULL,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            session_data TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        
        // Game results table
        `CREATE TABLE IF NOT EXISTS game_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            game_type VARCHAR(50) NOT NULL,
            score REAL,
            accuracy REAL,
            completion_time_ms INTEGER,
            detailed_results TEXT,
            completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        
        // Survey responses table
        `CREATE TABLE IF NOT EXISTS survey_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            survey_type VARCHAR(50) NOT NULL,
            responses TEXT,
            score INTEGER,
            interpretation VARCHAR(100),
            completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        
        // Audio recordings metadata table
        `CREATE TABLE IF NOT EXISTS audio_recordings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            game_session_id INTEGER,
            filename VARCHAR(255),
            azure_blob_url TEXT,
            transcription TEXT,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (game_session_id) REFERENCES game_sessions(id) ON DELETE SET NULL
        )`,
        
        // Problem set stats (migrated from localStorage)
        `CREATE TABLE IF NOT EXISTS problemset_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            set_id VARCHAR(50) NOT NULL,
            score INTEGER NOT NULL,
            total INTEGER NOT NULL,
            completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`
    ];

    tables.forEach(tableSQL => {
        db.run(tableSQL, (err) => {
            if (err) {
                console.error('Error creating table:', err.message);
            }
        });
    });
    
    console.log('Database tables initialized.');
}

// Rate limiting middleware
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'Too many authentication attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Enable CORS for all routes
app.use(cors());

// Middleware for parsing JSON and url-encoded form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'web' directory
const webPath = path.join(__dirname, 'web');
app.use(express.static(webPath));

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

// Authentication Endpoints

// User Registration
app.post('/api/auth/register',
    authLimiter,
    [
        body('email').isEmail().normalizeEmail(),
        body('username').isLength({ min: 3, max: 30 }).trim(),
        body('password').isLength({ min: 6 }),
        body('name').optional().trim(),
        body('age').optional().isInt({ min: 1, max: 150 }),
        body('grade_level').optional().trim()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, username, password, name, age, grade_level } = req.body;

            // Check if user already exists
            db.get('SELECT id FROM users WHERE email = ? OR username = ?', [email, username], async (err, row) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                if (row) {
                    return res.status(409).json({ error: 'User already exists with this email or username' });
                }

                try {
                    // Hash password
                    const saltRounds = 12;
                    const password_hash = await bcrypt.hash(password, saltRounds);

                    // Insert new user
                    const sql = `INSERT INTO users (email, username, password_hash, name, age, grade_level)
                                VALUES (?, ?, ?, ?, ?, ?)`;
                    
                    db.run(sql, [email, username, password_hash, name, age, grade_level], function(err) {
                        if (err) {
                            console.error('Error creating user:', err);
                            return res.status(500).json({ error: 'Failed to create user' });
                        }

                        // Generate JWT token
                        const token = jwt.sign(
                            { userId: this.lastID, email, username },
                            JWT_SECRET,
                            { expiresIn: '24h' }
                        );

                        res.status(201).json({
                            message: 'User registered successfully',
                            token,
                            user: {
                                id: this.lastID,
                                email,
                                username,
                                name,
                                age,
                                grade_level
                            }
                        });
                    });
                } catch (hashError) {
                    console.error('Password hashing error:', hashError);
                    res.status(500).json({ error: 'Registration failed' });
                }
            });
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ error: 'Registration failed' });
        }
    }
);

// User Login
app.post('/api/auth/login',
    authLimiter,
    [
        body('email').isEmail().normalizeEmail(),
        body('password').notEmpty()
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { email, password } = req.body;

            // Find user by email
            db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
                if (err) {
                    console.error('Database error:', err);
                    return res.status(500).json({ error: 'Database error' });
                }

                if (!user) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                try {
                    // Verify password
                    const validPassword = await bcrypt.compare(password, user.password_hash);
                    if (!validPassword) {
                        return res.status(401).json({ error: 'Invalid credentials' });
                    }

                    // Update last login
                    db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

                    // Generate JWT token
                    const token = jwt.sign(
                        { userId: user.id, email: user.email, username: user.username },
                        JWT_SECRET,
                        { expiresIn: '24h' }
                    );

                    res.json({
                        message: 'Login successful',
                        token,
                        user: {
                            id: user.id,
                            email: user.email,
                            username: user.username,
                            name: user.name,
                            age: user.age,
                            grade_level: user.grade_level,
                            last_login: user.last_login
                        }
                    });
                } catch (compareError) {
                    console.error('Password comparison error:', compareError);
                    res.status(500).json({ error: 'Login failed' });
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Login failed' });
        }
    }
);

// Get Current User Profile
app.get('/api/auth/me', authenticateToken, (req, res) => {
    db.get('SELECT id, email, username, name, age, grade_level, created_at, last_login FROM users WHERE id = ?',
        [req.user.userId], (err, user) => {
            if (err) {
                console.error('Database error:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            res.json({ user });
        });
});

// Update User Profile
app.put('/api/auth/profile',
    authenticateToken,
    [
        body('name').optional().trim(),
        body('age').optional().isInt({ min: 1, max: 150 }),
        body('grade_level').optional().trim()
    ],
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, age, grade_level } = req.body;
        const sql = `UPDATE users SET name = ?, age = ?, grade_level = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`;

        db.run(sql, [name, age, grade_level, req.user.userId], function(err) {
            if (err) {
                console.error('Error updating profile:', err);
                return res.status(500).json({ error: 'Failed to update profile' });
            }

            res.json({ message: 'Profile updated successfully' });
        });
    }
);

// Game Data Migration Endpoint
app.post('/api/games/migrate', authenticateToken, (req, res) => {
    const { gameResults, surveyResults, problemsetStats, inProgress } = req.body;
    const userId = req.user.userId;

    try {
        // Begin transaction-like approach
        let operations = [];

        // Migrate problem set stats
        if (problemsetStats) {
            Object.entries(problemsetStats).forEach(([key, stats]) => {
                if (key.startsWith('stats-set-')) {
                    const setId = key.replace('stats-set-', '');
                    operations.push(new Promise((resolve, reject) => {
                        const sql = `INSERT INTO problemset_stats (user_id, set_id, score, total)
                                     VALUES (?, ?, ?, ?)`;
                        db.run(sql, [userId, setId, stats.score, stats.total], function(err) {
                            if (err) reject(err);
                            else resolve();
                        });
                    }));
                }
            });
        }

        // Migrate game results (from app.js testResults)
        if (gameResults) {
            Object.entries(gameResults).forEach(([gameType, result]) => {
                operations.push(new Promise((resolve, reject) => {
                    const sql = `INSERT INTO game_results
                                (user_id, game_type, score, accuracy, detailed_results)
                                VALUES (?, ?, ?, ?, ?)`;
                    const score = gameType === 'soundlab' ? result.paScore :
                                  gameType === 'wordmachine' ? result.decodingScore :
                                  gameType === 'voicetest' ? 100 : 0;
                    const accuracy = result.accuracy || 0;
                    
                    db.run(sql, [userId, gameType, score, accuracy, JSON.stringify(result)], function(err) {
                        if (err) reject(err);
                        else resolve();
                    });
                }));
            });
        }

        // Migrate survey results
        if (surveyResults) {
            Object.entries(surveyResults).forEach(([surveyType, result]) => {
                operations.push(new Promise((resolve, reject) => {
                    const sql = `INSERT INTO survey_responses
                                (user_id, survey_type, responses, score, interpretation)
                                VALUES (?, ?, ?, ?, ?)`;
                    db.run(sql, [userId, surveyType, JSON.stringify(result), result.score || 0, result.interpret || ''], function(err) {
                        if (err) reject(err);
                        else resolve();
                    });
                }));
            });
        }

        // Execute all migration operations
        Promise.all(operations)
            .then(() => {
                res.json({ message: 'Data migrated successfully' });
            })
            .catch(error => {
                console.error('Migration error:', error);
                res.status(500).json({ error: 'Migration failed' });
            });

    } catch (error) {
        console.error('Migration error:', error);
        res.status(500).json({ error: 'Migration failed' });
    }
});

// Game Data Endpoints

// Save game session (in-progress)
app.post('/api/games/session', authenticateToken, (req, res) => {
    const { gameType, sessionData } = req.body;
    const userId = req.user.userId;

    const sql = `INSERT INTO game_sessions (user_id, game_type, session_data) VALUES (?, ?, ?)`;
    db.run(sql, [userId, gameType, JSON.stringify(sessionData)], function(err) {
        if (err) {
            console.error('Error saving game session:', err);
            return res.status(500).json({ error: 'Failed to save game session' });
        }

        res.json({ message: 'Game session saved', sessionId: this.lastID });
    });
});

// Complete game session with results
app.post('/api/games/complete', authenticateToken, (req, res) => {
    const { gameType, score, accuracy, completionTimeMs, detailedResults } = req.body;
    const userId = req.user.userId;

    const sql = `INSERT INTO game_results (user_id, game_type, score, accuracy, completion_time_ms, detailed_results)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [userId, gameType, score, accuracy, completionTimeMs, JSON.stringify(detailedResults)], function(err) {
        if (err) {
            console.error('Error saving game result:', err);
            return res.status(500).json({ error: 'Failed to save game result' });
        }

        res.json({ message: 'Game completed and saved', resultId: this.lastID });
    });
});

// Get user's game history
app.get('/api/games/history', authenticateToken, (req, res) => {
    const userId = req.user.userId;
    const { gameType, limit = 50 } = req.query;

    let sql = `SELECT * FROM game_results WHERE user_id = ?`;
    const params = [userId];

    if (gameType) {
        sql += ` AND game_type = ?`;
        params.push(gameType);
    }

    sql += ` ORDER BY completed_at DESC LIMIT ?`;
    params.push(parseInt(limit));

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Error fetching game history:', err);
            return res.status(500).json({ error: 'Failed to fetch game history' });
        }

        // Parse detailed_results JSON
        const history = rows.map(row => ({
            ...row,
            detailed_results: row.detailed_results ? JSON.parse(row.detailed_results) : null
        }));

        res.json({ history });
    });
});

// Get user's stats summary
app.get('/api/games/stats', authenticateToken, (req, res) => {
    const userId = req.user.userId;

    // Get game results summary
    const gameStatsSql = `
        SELECT
            game_type,
            COUNT(*) as plays,
            AVG(score) as avg_score,
            MAX(score) as best_score,
            AVG(accuracy) as avg_accuracy,
            MAX(completed_at) as last_played
        FROM game_results
        WHERE user_id = ?
        GROUP BY game_type
    `;

    // Get problemset stats
    const problemsetStatsSql = `
        SELECT set_id, score, total, completed_at
        FROM problemset_stats
        WHERE user_id = ?
        ORDER BY completed_at DESC
    `;

    db.all(gameStatsSql, [userId], (err, gameStats) => {
        if (err) {
            console.error('Error fetching game stats:', err);
            return res.status(500).json({ error: 'Failed to fetch stats' });
        }

        db.all(problemsetStatsSql, [userId], (err, problemsetStats) => {
            if (err) {
                console.error('Error fetching problemset stats:', err);
                return res.status(500).json({ error: 'Failed to fetch stats' });
            }

            res.json({
                gameStats,
                problemsetStats
            });
        });
    });
});

// Survey Endpoints

// Save survey response
app.post('/api/surveys/save', authenticateToken, (req, res) => {
    const { surveyType, responses, score, interpretation } = req.body;
    const userId = req.user.userId;

    // Use INSERT OR REPLACE to handle updates
    const sql = `INSERT OR REPLACE INTO survey_responses
                 (user_id, survey_type, responses, score, interpretation, completed_at)
                 VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;

    db.run(sql, [userId, surveyType, JSON.stringify(responses), score, interpretation], function(err) {
        if (err) {
            console.error('Error saving survey:', err);
            return res.status(500).json({ error: 'Failed to save survey' });
        }

        res.json({ message: 'Survey saved successfully' });
    });
});

// Get user's survey responses
app.get('/api/surveys/responses', authenticateToken, (req, res) => {
    const userId = req.user.userId;

    const sql = `SELECT * FROM survey_responses WHERE user_id = ? ORDER BY completed_at DESC`;

    db.all(sql, [userId], (err, rows) => {
        if (err) {
            console.error('Error fetching surveys:', err);
            return res.status(500).json({ error: 'Failed to fetch surveys' });
        }

        // Parse responses JSON
        const surveys = rows.map(row => ({
            ...row,
            responses: row.responses ? JSON.parse(row.responses) : null
        }));

        res.json({ surveys });
    });
});

// SPA Fallback (after API routes & static). Any non-API request returns web/app.html (or web/index.html)
app.get(/^(?!\/api\/).*/, (req, res) => {
    const appHtml = path.join(webPath, 'app.html');
    if (fs.existsSync(appHtml)) {
        return res.sendFile(appHtml);
    }
    const legacyIndex = path.join(webPath, 'index.html');
    if (fs.existsSync(legacyIndex)) {
        return res.sendFile(legacyIndex);
    }
    res.status(404).send('index.html not found in web/');
});

// Start the server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
