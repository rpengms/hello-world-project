document.addEventListener('DOMContentLoaded', () => {
  // New dyslexia assessment data (omit audio tasks)
  const problemData = {
    "dyslexia": [
      {
        question: "Letter/Sound Knowledge: Tap the letter that says /s/!",
        options: [
          { text: "s", value: "s" },
          { text: "c", value: "c" },
          { text: "z", value: "z" },
          { text: "m", value: "m" }
        ],
        correct: "s",
        explanation: "The letter 's' produces the /s/ sound. 'c' and 'z' are pronounced differently and 'm' does not make the /s/ sound."
      },
      {
        question: "Word Decoding: Which of these is a real word?",
        options: [
          { text: "und", value: "und" },
          { text: "jump", value: "jump" },
          { text: "prette", value: "prette" },
          { text: "flep", value: "flep" }
        ],
        correct: "jump",
        explanation: "'jump' is a real word while 'flep' is a nonword."
      },
      {
        question: "Word Decoding: Which of these is a nonword?",
        options: [
          { text: "and", value: "and" },
          { text: "jump", value: "jump" },
          { text: "trinding", value: "trinding" },
          { text: "pretty", value: "pretty" }
        ],
        correct: "trinding",
        explanation: "'trinding' is not an actual word, making it a nonword."
      }
    ],
    "1": [
      {
        question: "What is 2+2?",
        options: [
          { text: "3", value: "3" },
          { text: "4", value: "4" },
          { text: "5", value: "5" }
        ],
        correct: "4"
      },
      {
        question: "What is 3+3?",
        options: [
          { text: "5", value: "5" },
          { text: "6", value: "6" },
          { text: "7", value: "7" }
        ],
        correct: "6"
      }
    ],
    "2": [
      {
        question: "What is the capital of France?",
        options: [
          { text: "Berlin", value: "Berlin" },
          { text: "Paris", value: "Paris" },
          { text: "Madrid", value: "Madrid" }
        ],
        correct: "Paris"
      }
    ]
  };

  // Retrieve the set id from the URL (for example ?set=1 or ?set=dyslexia)
  const urlParams = new URLSearchParams(window.location.search);
  const setId = urlParams.get('set') || "1";

  // Update the set title.
  document.getElementById('setTitle').textContent = setId === "dyslexia" 
    ? "Lexy‐Style Dyslexia Assessment" 
    : `Problem Set ${setId}`;

  // Retrieve this set's questions.
  let questions = problemData[setId] || [];
  
  // For set "1", merge the dyslexia questions after the first question.
  if (setId === "1" && questions.length > 0 && problemData["dyslexia"]) {
    const additional = problemData["dyslexia"];
    console.log("Merging dyslexia questions into set 1…");
    questions = questions.slice(0, 1).concat(additional, questions.slice(1));
  }
  console.log("Final merged questions:", questions);

  let currentQuestionIndex = 0;
  const progressKey = `progress-set-${setId}`;
  let savedProgress = JSON.parse(localStorage.getItem(progressKey)) || {};

  // Build the MCQ viewer elements.
  const container = document.getElementById('questionContainer');
  const prevBtn = document.getElementById('prevQuestion');
  const nextBtn = document.getElementById('nextQuestion');
  const exitBtn = document.getElementById('exitBtn');

  let questionClones = [];

  // Build a dynamic correctAnswers object based on the merged questions.
  let correctAnswers = {};
  questions.forEach((qData, idx) => {
    correctAnswers["q" + idx] = qData.correct;
  });

  // Create question clones.
  questions.forEach((qData, idx) => {
    let qDiv = document.createElement('div');
    qDiv.classList.add('mcq-question');

    let p = document.createElement('p');
    p.textContent = qData.question;
    qDiv.appendChild(p);

    // Build vertical answer choices.
    let answersDiv = document.createElement('div');
    qData.options.forEach(opt => {
      let label = document.createElement('label');
      label.style.display = "block";
      label.style.marginBottom = "8px";
      let radio = document.createElement('input');
      radio.type = "radio";
      radio.name = `q${idx}`;
      radio.value = opt.value;
      // Preselect only if saved AFTER entering the site.
      if (savedProgress[`q${idx}`] && savedProgress[`q${idx}`] === opt.value) {
        radio.checked = true;
      }
      label.appendChild(radio);
      label.appendChild(document.createTextNode(" " + opt.text));
      answersDiv.appendChild(label);
    });
    qDiv.appendChild(answersDiv);

    // Explanation container.
    let explanationPara = document.createElement('p');
    explanationPara.classList.add('explanation');
    explanationPara.style.color = "darkred";
    explanationPara.style.fontStyle = "italic";
    explanationPara.style.marginTop = "10px";
    qDiv.appendChild(explanationPara);

    // Submit button.
    let submitBtn = document.createElement('button');
    submitBtn.textContent = "Submit";
    submitBtn.classList.add('submit-btn');
    submitBtn.style.display = "block";
    submitBtn.style.margin = "20px auto 0";
    qDiv.appendChild(submitBtn);

    // Prevent multiple submissions and enable next button on submit.
    submitBtn.addEventListener('click', () => {
      if (qDiv.dataset.submitted === "true") return;
      let selected = qDiv.querySelector(`input[name="q${idx}"]:checked`);
      const labels = qDiv.querySelectorAll('label');
      labels.forEach(label => { label.style.backgroundColor = ""; });
      if (!selected) {
        alert("Please select an answer.");
        return;
      }
      qDiv.dataset.submitted = "true";
      submitBtn.disabled = true;
      if (selected.value === qData.correct) {
        selected.parentElement.style.backgroundColor = "lightgreen";
      } else {
        selected.parentElement.style.backgroundColor = "salmon";
        labels.forEach(label => {
          let inp = label.querySelector("input");
          if (inp && inp.value === qData.correct) {
            label.style.backgroundColor = "lightgreen";
          }
        });
        explanationPara.textContent = "Explanation: " + qData.explanation;
      }
      savedProgress[`q${idx}`] = selected.value;
      localStorage.setItem(progressKey, JSON.stringify(savedProgress));
      // Enable next button immediately after a submission.
      nextBtn.disabled = false;
    });

    // Initially show only the first question.
    qDiv.style.display = idx === 0 ? "block" : "none";
    questionClones.push(qDiv);
  });

  // Display the first question.
  container.innerHTML = "";
  container.appendChild(questionClones[currentQuestionIndex]);
  nextBtn.disabled = !questionClones[currentQuestionIndex].dataset.submitted;

  // Previous button.
  prevBtn.addEventListener("click", () => {
    if (currentQuestionIndex > 0) {
      container.innerHTML = "";
      currentQuestionIndex--;
      // Make sure the displayed clone is visible.
      questionClones[currentQuestionIndex].style.display = "block";
      container.appendChild(questionClones[currentQuestionIndex]);
      nextBtn.disabled = !questionClones[currentQuestionIndex].dataset.submitted;
      if (currentQuestionIndex === 0) prevBtn.disabled = true;
      nextBtn.textContent = ">";
    }
  });

  // Next/Finish button.
  nextBtn.addEventListener("click", () => {
    if (!questionClones[currentQuestionIndex].dataset.submitted) {
      alert("Please submit your answer before proceeding.");
      return;
    }
    if (currentQuestionIndex === questionClones.length - 1) {
      let score = 0;
      questionClones.forEach((qEl, idx) => {
        let selected = qEl.querySelector(`input[name="q${idx}"]:checked`);
        if (selected && selected.value === questions[idx].correct) {
          score++;
        }
      });
      // Record stats
      const statsKey = `stats-set-${setId}`;
      localStorage.setItem(statsKey, JSON.stringify({
        score: score,
        total: questionClones.length
      }));
      
      alert(`You completed the assessment!\nYour score: ${score} out of ${questionClones.length}`);
      localStorage.removeItem(progressKey);
      // Reload ensures proper page re-rendering.
      window.location.reload();
    } else {
      container.innerHTML = "";
      currentQuestionIndex++;
      // Ensure the new clone is visible.
      questionClones[currentQuestionIndex].style.display = "block";
      container.appendChild(questionClones[currentQuestionIndex]);
      nextBtn.disabled = !questionClones[currentQuestionIndex].dataset.submitted;
      prevBtn.disabled = false;
      nextBtn.textContent = (currentQuestionIndex === questionClones.length - 1) ? "Finish" : ">";
    }
  });

  // Exit button.
  exitBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });
});