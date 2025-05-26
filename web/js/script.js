import { loadFlashcard, nextFlashcard, prevFlashcard } from './flashcard.js';

window.onload = function() {
    loadFlashcard(0);
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
        prevFlashcard();
    });

    nextButton.addEventListener('click', () => {
        nextFlashcard();
    });
});
