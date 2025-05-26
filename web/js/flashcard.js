const flashcards = [
    { text: 'A', sound: 'sounds/a.mp3' },
    { text: 'B', sound: 'sounds/b.mp3' },
    // Add more flashcards as needed
];

let currentFlashcardIndex = 0;

export function loadFlashcard(index) {
    const flashcard = flashcards[index];
    const flashcardText = document.getElementById('flashcardText');
    const flashcardAudio = document.getElementById('flashcardAudio');

    flashcardText.textContent = flashcard.text;
    flashcardAudio.src = flashcard.sound;
}

export function nextFlashcard() {
    currentFlashcardIndex = (currentFlashcardIndex + 1) % flashcards.length;
    loadFlashcard(currentFlashcardIndex);
}

export function prevFlashcard() {
    currentFlashcardIndex = (currentFlashcardIndex - 1 + flashcards.length) % flashcards.length;
    loadFlashcard(currentFlashcardIndex);
}
