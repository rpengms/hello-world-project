document.addEventListener('DOMContentLoaded', () => {
    const statsContainer = document.getElementById('statsContainer');
    let statsHTML = "";
    
    // Find all keys that match "stats-set-..."
    const keys = Object.keys(localStorage).filter(key => key.startsWith('stats-set-'));
    
    if (keys.length === 0) {
        statsHTML = "<p>No stats recorded yet.</p>";
    } else {
        keys.forEach(key => {
            let stat = JSON.parse(localStorage.getItem(key));
            // The key is in the format "stats-set-{setId}".
            const setId = key.replace("stats-set-", "");
            statsHTML += `<p>Set ${setId}: Score ${stat.score} out of ${stat.total}</p>`;
        });
    }
    
    statsContainer.innerHTML = statsHTML;
});