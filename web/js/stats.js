document.addEventListener('DOMContentLoaded', async () => {
    await loadStats();
});

async function loadStats() {
    const statsContainer = document.getElementById('statsContainer');
    if (!statsContainer) return;

    let statsHTML = "";
    
    if (window.authService && window.authService.isAuthenticated()) {
        // Load stats from server for registered users
        try {
            const response = await window.authService.apiRequest('/games/stats');
            if (response.ok) {
                const serverStats = await response.json();
                statsHTML = renderServerStats(serverStats);
            } else {
                statsHTML = "<p>Error loading stats from server.</p>";
            }
        } catch (error) {
            console.error('Error loading server stats:', error);
            statsHTML = "<p>Error connecting to server. Loading local stats...</p>";
            // Fallback to local stats
            statsHTML += renderLocalStats();
        }
    } else {
        // Load stats from localStorage for guest users
        statsHTML = renderLocalStats();
    }
    
    statsContainer.innerHTML = statsHTML;
}

function renderServerStats(serverStats) {
    const { gameStats, problemsetStats } = serverStats;
    let html = "<h2>Your Game Statistics</h2>";
    
    if (!gameStats || gameStats.length === 0) {
        html += "<p>No game statistics recorded yet.</p>";
    } else {
        html += "<div class='game-stats'>";
        gameStats.forEach(stat => {
            const gameTitle = getGameTitle(stat.game_type);
            const avgScore = Math.round(stat.average_score || 0);
            const bestScore = Math.round(stat.best_score || 0);
            
            html += `
                <div class='stat-card'>
                    <h3>${gameTitle}</h3>
                    <p><strong>Plays:</strong> ${stat.plays || 0}</p>
                    <p><strong>Best Score:</strong> ${bestScore}/100</p>
                    <p><strong>Average Score:</strong> ${avgScore}/100</p>
                    <p><strong>Last Played:</strong> ${formatDate(stat.last_played)}</p>
                </div>
            `;
        });
        html += "</div>";
    }
    
    if (problemsetStats && problemsetStats.length > 0) {
        html += "<h2>Problem Set Statistics</h2>";
        html += "<div class='problemset-stats'>";
        problemsetStats.forEach(stat => {
            html += `
                <div class='stat-card'>
                    <h3>Set ${stat.set_id}</h3>
                    <p><strong>Score:</strong> ${stat.score || 0}/${stat.total || 0}</p>
                    <p><strong>Percentage:</strong> ${Math.round((stat.score/Math.max(1,stat.total))*100)}%</p>
                    <p><strong>Completed:</strong> ${formatDate(stat.completed_at)}</p>
                </div>
            `;
        });
        html += "</div>";
    }
    
    return html;
}

function renderLocalStats() {
    let html = "<h2>Local Statistics (Guest Mode)</h2>";
    
    // Find all keys that match "stats-set-..." (legacy problem sets)
    const keys = Object.keys(localStorage).filter(key => key.startsWith('stats-set-'));
    
    // Check for game results in localStorage
    const testResults = JSON.parse(localStorage.getItem('testResults') || '{}');
    
    if (testResults.testResults) {
        html += "<div class='game-stats'>";
        const results = testResults.testResults;
        
        if (results.soundlab) {
            html += `
                <div class='stat-card'>
                    <h3>Sound Lab</h3>
                    <p><strong>Score:</strong> ${Math.round(results.soundlab.paScore || 0)}/100</p>
                </div>
            `;
        }
        
        if (results.wordmachine) {
            html += `
                <div class='stat-card'>
                    <h3>Word Machine</h3>
                    <p><strong>Score:</strong> ${Math.round(results.wordmachine.decodingScore || 0)}/100</p>
                    <p><strong>Real Words:</strong> ${Math.round((results.wordmachine.realAcc || 0) * 100)}%</p>
                    <p><strong>Pseudo Words:</strong> ${Math.round((results.wordmachine.pseudoAcc || 0) * 100)}%</p>
                </div>
            `;
        }
        
        if (results.speedsense) {
            html += `
                <div class='stat-card'>
                    <h3>Speed & Sense</h3>
                    <p><strong>Score:</strong> ${Math.round(results.speedsense.composite || 0)}/100</p>
                    <p><strong>Reading Speed:</strong> ${Math.round(results.speedsense.wpm || 0)} WPM</p>
                    <p><strong>Comprehension:</strong> ${Math.round((results.speedsense.compAcc || 0) * 100)}%</p>
                </div>
            `;
        }
        
        html += "</div>";
    }
    
    if (keys.length > 0) {
        html += "<h2>Problem Set Statistics</h2>";
        html += "<div class='problemset-stats'>";
        keys.forEach(key => {
            let stat = JSON.parse(localStorage.getItem(key));
            const setId = key.replace("stats-set-", "");
            html += `
                <div class='stat-card'>
                    <h3>Set ${setId}</h3>
                    <p><strong>Score:</strong> ${stat.score}/${stat.total}</p>
                    <p><strong>Percentage:</strong> ${Math.round((stat.score/stat.total)*100)}%</p>
                </div>
            `;
        });
        html += "</div>";
    }
    
    if (keys.length === 0 && !testResults.testResults) {
        html += "<p>No statistics recorded yet. Complete some games to see your progress!</p>";
    }
    
    return html;
}

function getGameTitle(gameType) {
    const titles = {
        'soundlab': 'Sound Lab',
        'wordmachine': 'Word Machine',
        'speedsense': 'Speed & Sense',
        'voicetest': 'Voice Test'
    };
    return titles[gameType] || gameType;
}

function formatDate(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Listen for auth state changes to reload stats
document.addEventListener('authStateChange', () => {
    setTimeout(loadStats, 100); // Small delay to ensure auth state is updated
});