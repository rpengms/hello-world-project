// ----- Flashcards functionality -----
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

document.addEventListener('DOMContentLoaded', () => {
    // Clear out any saved progress for problem sets on entry.
    Object.keys(localStorage)
      .filter(key => key.startsWith('progress-set-'))
      .forEach(key => localStorage.removeItem(key));

    // Initialize flashcard on DOM ready
    loadFlashcard(currentFlashcardIndex);

    // Flashcards buttons
    const yesButton = document.getElementById('yesButton');
    const noButton = document.getElementById('noButton');
    const playSoundButton = document.getElementById('playSoundButton');
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');

    yesButton.addEventListener('click', () => {
        alert('You clicked Yes!');
        nextFlashcard();
    });

    noButton.addEventListener('click', () => {
        alert('You clicked No!');
        nextFlashcard();
    });

    playSoundButton.addEventListener('click', () => {
        document.getElementById('flashcardAudio').play();
    });

    prevButton.addEventListener('click', () => {
        currentFlashcardIndex = (currentFlashcardIndex - 1 + flashcards.length) % flashcards.length;
        loadFlashcard(currentFlashcardIndex);
    });

    nextButton.addEventListener('click', () => {
        nextFlashcard();
    });

    function nextFlashcard() {
        currentFlashcardIndex = (currentFlashcardIndex + 1) % flashcards.length;
        loadFlashcard(currentFlashcardIndex);
    }

    // ----- Navigation between pages -----
    const navFlashcards = document.getElementById('navFlashcards');
    const navMCQ = document.getElementById('navMCQ');
    const flashcardsPage = document.getElementById('flashcardsPage');
    const mcqPage = document.getElementById('mcqPage');

    navFlashcards.addEventListener('click', () => {
        flashcardsPage.style.display = 'block';
        mcqPage.style.display = 'none';
    });

    navMCQ.addEventListener('click', () => {
        flashcardsPage.style.display = 'none';
        mcqPage.style.display = 'block';
    });

    // ----- Updated MCQ Navigation Handling -----
    const mcqForms = document.querySelectorAll('.mcq-form');
    mcqForms.forEach(form => {
        const questions = form.querySelectorAll('.mcq-question');
        // Hide all questions except the first:
        questions.forEach((q, idx) => {
            q.style.display = idx === 0 ? 'block' : 'none';
        });

        const correctAnswers = form.getAttribute('data-set') === "1"
            ? { q1: "4", q2: "6" }
            : form.getAttribute('data-set') === "2"
            ? { q1: "Paris", q2: "Madrid" }
            : {};

        questions.forEach((question, idx) => {
            const submitBtn = question.querySelector('.submit-btn');
            const nextBtn = question.querySelector('.next-question-btn');
            if (nextBtn) nextBtn.style.display = 'none';
            
            submitBtn.addEventListener('click', () => {
                const questionName = question.querySelector('input').name;
                const selected = question.querySelector(`input[name="${questionName}"]:checked`);
                const options = question.querySelectorAll('label');
                // Remove previous styling
                options.forEach(label => {
                    label.style.backgroundColor = '';
                });
                if (!selected) {
                    alert('Please complete the question before proceeding.');
                    return;
                }
                if (selected.value === correctAnswers[questionName]) {
                    selected.parentElement.style.backgroundColor = 'lightgreen';
                } else {
                    selected.parentElement.style.backgroundColor = 'salmon';
                    options.forEach(label => {
                        const input = label.querySelector('input');
                        if (input.value === correctAnswers[questionName])
                            label.style.backgroundColor = 'lightgreen';
                    });
                }
                // Enable navigation:
                if (nextBtn) nextBtn.style.display = 'inline-block';
            });

            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    question.style.display = 'none';
                    if (idx < questions.length - 1) {
                        questions[idx + 1].style.display = 'block';
                    } else {
                        alert('You have completed this set.');
                    }
                });
            }
        });
    });

    // Instead of toggling a dropdown, clicking a problem set button opens the MCQ viewer overlay.
    const problemSetButtons = document.querySelectorAll('.problem-set .toggle-set');
    problemSetButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Look for the associated hidden form within the same problem-set element.
            const form = button.parentElement.querySelector('.mcq-form');
            if (form) {
                openMCQViewer(form);
            } else {
                alert('No questions available for this problem set.');
            }
        });
    });

    function openMCQViewer(form) {
        // Retrieve any saved progress for this problem set.
        const set = form.getAttribute('data-set');
        const progressKey = `progress-set-${set}`;
        let savedProgress = JSON.parse(localStorage.getItem(progressKey)) || {};
      
        // Create an overlay viewer for MCQs.
        let viewer = document.createElement('div');
        viewer.id = 'mcqViewer';
        Object.assign(viewer.style, {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: '#fff',
            zIndex: '1000',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        });

        // Container for the current question.
        let questionContainer = document.createElement('div');
        questionContainer.id = 'mcqQuestionContainer';
        questionContainer.style.width = '80%';
        questionContainer.style.maxWidth = '600px';
        questionContainer.style.marginBottom = '20px';

        // Navigation container with arrow buttons.
        let navContainer = document.createElement('div');
        navContainer.classList.add('mcq-navigation');

        let prevButton = document.createElement('button');
        prevButton.id = 'mcqPrevButton';
        prevButton.textContent = '<';
        prevButton.disabled = true;

        let nextButton = document.createElement('button');
        nextButton.id = 'mcqNextButton';
        nextButton.textContent = '>';
        nextButton.disabled = true; // Remains disabled until answer is submitted

        navContainer.appendChild(prevButton);
        navContainer.appendChild(nextButton);

        // Close button to exit the viewer.
        let closeButton = document.createElement('button');
        closeButton.textContent = 'Close';
        closeButton.style.marginTop = '20px';
        closeButton.addEventListener('click', () => {
            document.body.removeChild(viewer);
        });

        viewer.appendChild(questionContainer);
        viewer.appendChild(navContainer);
        viewer.appendChild(closeButton);
        document.body.appendChild(viewer);

        // Get all questions from the hidden form.
        const questions = Array.from(form.querySelectorAll('.mcq-question'));
        let currentQuestionIndex = 0;
        let questionClones = [];

        // Determine correct answers based on data-set.
        let correctAnswers = set === "1"
            ? { q1: "4", q2: "6" }
            : set === "2"
            ? { q1: "Paris" }  // adjust as needed
            : {};

        // Prepare each question: clone it and add a submit button if missing.
        questions.forEach((q, idx) => {
            let clone = q.cloneNode(true);
            // Remove any default selection from cloned question's radio buttons.
            const radios = clone.querySelectorAll('input[type="radio"]');
            radios.forEach(radio => {
                radio.checked = false;
                radio.removeAttribute('checked');
            });
            // If saved progress exists for this question (saved AFTER entering the site),
            // re-select that answer.
            let input = clone.querySelector('input');
            if (input && savedProgress[input.name]) {
                radios.forEach(radio => {
                    if (radio.value === savedProgress[input.name]) {
                        radio.checked = true;
                    }
                });
            }
            let submitBtn = clone.querySelector('.submit-btn');
            if (!submitBtn) {
                submitBtn = document.createElement('button');
                submitBtn.textContent = 'Submit';
                submitBtn.classList.add('submit-btn');
                clone.appendChild(submitBtn);
            }
            submitBtn.addEventListener('click', () => {
                // Only allow one submission.
                if (clone.dataset.submitted === 'true') return;
                clone.dataset.submitted = 'true';
                submitBtn.disabled = true;  // Prevent multiple submissions
                
                let input = clone.querySelector('input');
                if (input) {
                    let qName = input.name;
                    const selected = clone.querySelector(`input[name="${qName}"]:checked`);
                    const labels = clone.querySelectorAll('label');
                    labels.forEach(label => { label.style.backgroundColor = ''; });
                    if (!selected) {
                        alert('Please select an answer.');
                        // Reset submitted state so user can click again.
                        clone.dataset.submitted = '';
                        submitBtn.disabled = false;
                        return;
                    }
                    if (selected.value === correctAnswers[qName]) {
                        selected.parentElement.style.backgroundColor = 'lightgreen';
                    } else {
                        selected.parentElement.style.backgroundColor = 'salmon';
                        labels.forEach(label => {
                            let inp = label.querySelector('input');
                            if (inp && inp.value === correctAnswers[qName]) {
                                label.style.backgroundColor = 'lightgreen';
                            }
                        });
                        // Provide explanation for the wrong answer.
                        let explanationText = document.createElement('p');
                        explanationText.classList.add('explanation');
                        explanationText.style.color = 'darkred';
                        explanationText.style.fontStyle = 'italic';
                        // Here you can customize the explanation or retrieve it from the element.
                        explanationText.textContent = "Explanation: Review the underlying concept to understand why the correct answer is chosen.";
                        clone.appendChild(explanationText);
                    }
                    // Save progress for this question.
                    savedProgress[qName] = selected.value;
                    localStorage.setItem(progressKey, JSON.stringify(savedProgress));
                    // Enable the Next/Finish (right arrow) button.
                    nextButton.disabled = false;
                }
            });
            // Initially, show only the first question.
            clone.style.display = idx === 0 ? 'block' : 'none';
            questionClones.push(clone);
        });

        // Display the first question.
        questionContainer.appendChild(questionClones[currentQuestionIndex]);

        // Navigation: Previous button.
        prevButton.addEventListener('click', () => {
            if (currentQuestionIndex > 0) {
                questionContainer.innerHTML = '';
                currentQuestionIndex--;
                questionContainer.appendChild(questionClones[currentQuestionIndex]);
                // Disable Next until the current question is submitted.
                nextButton.disabled = questionClones[currentQuestionIndex].dataset.submitted !== 'true';
                if (currentQuestionIndex === 0) {
                    prevButton.disabled = true;
                }
                // Reset Next button text if not on last question.
                nextButton.textContent = '>';
            }
        });

        // Navigation: Next/Finish button; only allows advancing if the current question is submitted.
        nextButton.addEventListener('click', () => {
            if (questionClones[currentQuestionIndex].dataset.submitted !== 'true') {
                alert('Please submit your answer before proceeding.');
                return;
            }
            if (currentQuestionIndex === questionClones.length - 1) {
                // Finish behavior: compute score, alert report, and clear saved progress.
                let score = 0;
                questionClones.forEach((clone, idx) => {
                    let input = clone.querySelector('input');
                    if (input) {
                        let qName = input.name;
                        const selected = clone.querySelector(`input[name="${qName}"]:checked`);
                        if (selected && selected.value === correctAnswers[qName]) {
                            score++;
                        }
                    }
                });
                alert(`You completed the set!\nYour score: ${score} out of ${questionClones.length}`);
                // Clear progress for this problem set when finishing.
                localStorage.removeItem(progressKey);
                document.body.removeChild(viewer);
            } else {
                questionContainer.innerHTML = '';
                currentQuestionIndex++;
                questionContainer.appendChild(questionClones[currentQuestionIndex]);
                // Disable Next until the next question is submitted.
                nextButton.disabled = questionClones[currentQuestionIndex].dataset.submitted !== 'true';
                prevButton.disabled = false;
                // Update Next button’s label.
                if (currentQuestionIndex === questionClones.length - 1) {
                    nextButton.textContent = 'Finish';
                } else {
                    nextButton.textContent = '>';
                }
            }
        });
    }
});
