const flashcards = [
    { text: 'A', sound: 'sounds/a.mp3' },
    { text: 'B', sound: 'sounds/b.mp3' },
    // Add more flashcards as needed
];

let currentFlashcardIndex = 0;

function loadFlashcard(index) {
    const flashcard = flashcards[index];
    const flashcardText = document.getElementById('flashcardText');
    const flashcardAudio = document.getElementById('flashcardAudio');

    flashcardText.textContent = flashcard.text;
    flashcardAudio.src = flashcard.sound;
}

window.onload = function() {
    loadFlashcard(currentFlashcardIndex);
};

document.addEventListener('DOMContentLoaded', () => {
    const yesButton = document.getElementById('yesButton');
    const noButton = document.getElementById('noButton');
    const playSoundButton = document.getElementById('playSoundButton');
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');

    // Debugging: Log button elements to the console
    console.log('yesButton:', yesButton);
    console.log('noButton:', noButton);
    console.log('playSoundButton:', playSoundButton);
    console.log('prevButton:', prevButton);
    console.log('nextButton:', nextButton);

    yesButton.addEventListener('click', () => {
        alert('You clicked Yes!');
        nextFlashcard();
    });

    noButton.addEventListener('click', () => {
        alert('You clicked No!');
        nextFlashcard();
    });

    playSoundButton.addEventListener('click', () => {
        const flashcardAudio = document.getElementById('flashcardAudio');
        flashcardAudio.play();
    });

    prevButton.addEventListener('click', () => {
        currentFlashcardIndex = (currentFlashcardIndex - 1 + flashcards.length) % flashcards.length;
        loadFlashcard(currentFlashcardIndex);
    });

    nextButton.addEventListener('click', () => {
        nextFlashcard();
    });
});

function nextFlashcard() {
    currentFlashcardIndex = (currentFlashcardIndex + 1) % flashcards.length;
    loadFlashcard(currentFlashcardIndex);
}
