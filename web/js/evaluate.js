let passages = [];
let currentPassageIndex = 0;

async function loadPassages() {
    try {
        const response = await fetch('  /data/passages.json');
        const data = await response.json();
        passages = data.passage || [];
        displayPassage(currentPassageIndex);
    } catch (error) {
        console.error('Error loading passages:', error);
        document.getElementById('passageContent').textContent = 'Error loading passages. Check console for details.';
    }
}

function displayPassage(index) {
    const passageContent = document.getElementById('passageContent');
    const adminMode = document.getElementById('adminToggle').checked;
    if (passages.length > 0 && passages[index]) {
        const passage = passages[index];
        if (adminMode) {
            // Admin view with full details
            passageContent.innerHTML = `
                <h3>${passage.Subject}</h3>
                <p><strong>Target:</strong> ${passage.Target}</p>
                <p class="passage-text">${passage.Content}</p>
                <p><strong>Criteria:</strong> ${passage.Criteria}</p>
            `;
        } else {
            // Regular user view
            passageContent.innerHTML = `
                <h3>Please read the following aloud!</h3>
                <p class="passage-text">${passage.Content}</p>
            `;
        }
    } else {
        passageContent.textContent = 'No passage available';
    }
}

function toggleAdminMode() {
    adminMode = document.getElementById('adminToggle').checked;
    displayPassage(currentPassageIndex); // Refresh the current passage display
}

document.addEventListener('DOMContentLoaded', () => {
    const prevButton = document.getElementById('prevPassageButton');
    const nextButton = document.getElementById('nextPassageButton');
    const adminToggle = document.getElementById('adminToggle');
    
    adminToggle.addEventListener('change', toggleAdminMode);

    prevButton.addEventListener('click', () => {
        currentPassageIndex = (currentPassageIndex - 1 + passages.length) % passages.length;
        displayPassage(currentPassageIndex);
    });

    nextButton.addEventListener('click', () => {
        currentPassageIndex = (currentPassageIndex + 1) % passages.length;
        displayPassage(currentPassageIndex);
    });

    loadPassages();
});
