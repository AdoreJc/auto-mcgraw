let messageListener = null;
let isAutomating = false;
let lastIncorrectQuestion = null;
let lastCorrectAnswer = null;

function setupMessageListener() {
  if (messageListener) {
    chrome.runtime.onMessage.removeListener(messageListener);
  }

  messageListener = (message, sender, sendResponse) => {
    if (message.type === "processChatGPTResponse") {
      processChatGPTResponse(message.response);
      sendResponse({ received: true });
      return true;
    }

    if (message.type === "alertMessage") {
      alert(message.message);
      sendResponse({ received: true });
      return true;
    }
  };

  chrome.runtime.onMessage.addListener(messageListener);
}

function handleTopicOverview() {
  const continueButton = document.querySelector(
    "awd-topic-overview-button-bar .next-button, .button-bar-wrapper .next-button"
  );

  if (
    continueButton &&
    continueButton.textContent.trim().toLowerCase().includes("continue")
  ) {
    continueButton.click();

    setTimeout(() => {
      if (isAutomating) {
        checkForNextStep();
      }
    }, 1000);

    return true;
  }
  return false;
}

function handleForcedLearning() {
  const forcedLearningAlert = document.querySelector(
    ".forced-learning .alert-error"
  );
  if (forcedLearningAlert) {
    const readButton = document.querySelector(
      '[data-automation-id="lr-tray_reading-button"]'
    );
    if (readButton) {
      readButton.click();

      waitForElement('[data-automation-id="reading-questions-button"]', 10000)
        .then((toQuestionsButton) => {
          toQuestionsButton.click();
          return waitForNextButton(10000);
        })
        .then((nextButton) => {
          nextButton.click();
          if (isAutomating) {
            setTimeout(() => {
              checkForNextStep();
            }, 1000);
          }
        })
        .catch((error) => {
          console.error("Error in forced learning flow:", error);
          isAutomating = false;
        });
      return true;
    }
  }
  return false;
}

function checkForNextStep() {
  if (!isAutomating) return;

  if (handleTopicOverview()) {
    return;
  }

  if (handleForcedLearning()) {
    return;
  }

  const container = document.querySelector(".probe-container");
  if (container && !container.querySelector(".forced-learning")) {
    const qData = parseQuestion();
    if (qData) {
      chrome.runtime.sendMessage({
        type: "sendQuestionToChatGPT",
        question: qData,
      });
    }
  }
}

function extractCorrectAnswer() {
  const container = document.querySelector(".probe-container");
  if (!container) return null;

  const incorrectMarker = container.querySelector(
    ".awd-probe-correctness.incorrect"
  );
  if (!incorrectMarker) return null;

  let questionType = "";
  if (container.querySelector(".awd-probe-type-multiple_choice")) {
    questionType = "multiple_choice";
  } else if (container.querySelector(".awd-probe-type-true_false")) {
    questionType = "true_false";
  } else if (container.querySelector(".awd-probe-type-multiple_select")) {
    questionType = "multiple_select";
  } else if (container.querySelector(".awd-probe-type-fill_in_the_blank")) {
    questionType = "fill_in_the_blank";
  } else if (container.querySelector(".awd-probe-type-matching")) {
    questionType = "matching";
  } else if (container.querySelector(".awd-probe-type-sortable")) {
    questionType = "ordering";
  }

  let questionText = "";
  const promptEl = container.querySelector(".prompt");

  if (questionType === "fill_in_the_blank" && promptEl) {
    const promptClone = promptEl.cloneNode(true);

    const spans = promptClone.querySelectorAll(
      "span.response-container, span.fitb-span, span.blank-label, span.correctness, span._visuallyHidden"
    );
    spans.forEach((span) => span.remove());

    const inputs = promptClone.querySelectorAll("input.fitb-input");
    inputs.forEach((input) => {
      const blankMarker = document.createTextNode("[BLANK]");
      input.parentNode.replaceChild(blankMarker, input);
    });

    questionText = promptClone.textContent.trim();
  } else {
    questionText = promptEl ? promptEl.textContent.trim() : "";
  }

  let correctAnswer = null;

  if (questionType === "multiple_choice" || questionType === "true_false") {
    try {
      const answerContainer = container.querySelector(
        ".answer-container .choiceText"
      );
      if (answerContainer) {
        correctAnswer = answerContainer.textContent.trim();
      } else {
        const correctAnswerContainer = container.querySelector(
          ".correct-answer-container"
        );
        if (correctAnswerContainer) {
          const answerText =
            correctAnswerContainer.querySelector(".choiceText");
          if (answerText) {
            correctAnswer = answerText.textContent.trim();
          } else {
            const answerDiv = correctAnswerContainer.querySelector(".choice");
            if (answerDiv) {
              correctAnswer = answerDiv.textContent.trim();
            }
          }
        }
      }
    } catch (e) {
      console.error("Error extracting multiple choice answer:", e);
    }
  } else if (questionType === "multiple_select") {
    try {
      const correctAnswersList = container.querySelectorAll(
        ".correct-answer-container .choice"
      );
      if (correctAnswersList && correctAnswersList.length > 0) {
        correctAnswer = Array.from(correctAnswersList).map((el) => {
          const choiceText = el.querySelector(".choiceText");
          return choiceText
            ? choiceText.textContent.trim()
            : el.textContent.trim();
        });
      }
    } catch (e) {
      console.error("Error extracting multiple select answers:", e);
    }
  } else if (questionType === "fill_in_the_blank") {
    try {
      const correctAnswersList = container.querySelectorAll(".correct-answers");

      if (correctAnswersList && correctAnswersList.length > 0) {
        if (correctAnswersList.length === 1) {
          const correctAnswerEl =
            correctAnswersList[0].querySelector(".correct-answer");
          if (correctAnswerEl) {
            correctAnswer = correctAnswerEl.textContent.trim();
          } else {
            const answerText = correctAnswersList[0].textContent.trim();
            if (answerText) {
              const match = answerText.match(/:\s*(.+)$/);
              correctAnswer = match ? match[1].trim() : answerText;
            }
          }
        } else {
          correctAnswer = Array.from(correctAnswersList).map((field) => {
            const correctAnswerEl = field.querySelector(".correct-answer");
            if (correctAnswerEl) {
              return correctAnswerEl.textContent.trim();
            } else {
              const answerText = field.textContent.trim();
              const match = answerText.match(/:\s*(.+)$/);
              return match ? match[1].trim() : answerText;
            }
          });
        }
      }
    } catch (e) {
      console.error("Error extracting fill in the blank answers:", e);
    }
  }

  if (questionType === "matching" || questionType === "ordering") {
    return null;
  }

  if (correctAnswer === null) {
    console.error("Failed to extract correct answer for", questionType);
    return null;
  }

  return {
    question: questionText,
    answer: correctAnswer,
    type: questionType,
  };
}

function cleanAnswer(answer) {
  if (!answer) return answer;

  if (Array.isArray(answer)) {
    return answer.map((item) => cleanAnswer(item));
  }

  if (typeof answer === "string") {
    let cleanedAnswer = answer.trim();

    cleanedAnswer = cleanedAnswer.replace(/^Field \d+:\s*/, "");

    if (cleanedAnswer.includes(" or ")) {
      cleanedAnswer = cleanedAnswer.split(" or ")[0].trim();
    }

    return cleanedAnswer;
  }

  return answer;
}

function processChatGPTResponse(responseText) {
  try {
    if (handleTopicOverview()) {
      return;
    }

    if (handleForcedLearning()) {
      return;
    }

    const response = JSON.parse(responseText);
    const answers = Array.isArray(response.answer)
      ? response.answer
      : [response.answer];

    const container = document.querySelector(".probe-container");
    if (!container) return;

    lastIncorrectQuestion = null;
    lastCorrectAnswer = null;

    let didApplyAnswer = false;

    if (container.querySelector(".awd-probe-type-matching")) {
      alert(
        "Matching Question Solution:\n\n" +
          answers.join("\n") +
          "\n\nPlease input these matches manually, then click high confidence and next."
      );
      // Matching can't be reliably automated. Pause automation so we don't race
      // ahead trying to click Next before the user completes the matching UI.
      if (isAutomating) {
        isAutomating = false;
      }
      return;
    } else if (container.querySelector(".awd-probe-type-sortable")) {
      const orderList = Array.isArray(answers) ? answers : [answers];
      alert(
        "Ordering Question – correct order (top to bottom):\n\n" +
          orderList.map((item, i) => `${i + 1}. ${item}`).join("\n") +
          "\n\nPlease drag items into this order, then click high confidence and next."
      );
      if (isAutomating) {
        isAutomating = false;
      }
      return;
    } else if (container.querySelector(".awd-probe-type-fill_in_the_blank")) {
      const inputs = container.querySelectorAll("input.fitb-input");
      let filled = 0;
      inputs.forEach((input, index) => {
        if (answers[index]) {
          input.value = answers[index];
          input.dispatchEvent(new Event("input", { bubbles: true }));
          filled += 1;
        }
      });
      didApplyAnswer = filled > 0;
    } else {
      const choices = querySelectorAllIncludingShadow(
        'input[type="radio"], input[type="checkbox"]',
        container
      );
      if (!choices.length) {
        const fallback = container.querySelectorAll(
          'input[type="radio"], input[type="checkbox"]'
        );
        choices.push(...fallback);
      }

      const normalizeForMatch = (s) =>
        (s || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, " ")
          .replace(/\.$/, "");

      const answerMatchesChoice = (normAnswer, normChoice) => {
        if (normAnswer === normChoice) return true;
        const minLen = 12;
        if (normAnswer.length >= minLen && normChoice.includes(normAnswer)) return true;
        if (normChoice.length >= minLen && normAnswer.includes(normChoice)) return true;
        return false;
      };

      choices.forEach((choice) => {
        const label = choice.closest("label");
        const row = choice.closest(".choice-row");
        const choiceTextEl = label
          ? label.querySelector(".choiceText") || label.querySelector(".choice-container")
          : row?.querySelector(".choiceText") || row?.querySelector(".choice-container");
        const choiceText = choiceTextEl?.textContent?.trim();
        if (choiceText) {
          const normChoice = normalizeForMatch(choiceText);
          const shouldBeSelected = answers.some((ans) => {
            const a = normalizeForMatch(typeof ans === "string" ? ans : String(ans));
            return answerMatchesChoice(a, normChoice);
          });

          const isCheckbox = choice.type === "checkbox";
          const needsClick = isCheckbox
            ? choice.checked !== shouldBeSelected
            : shouldBeSelected && !choice.checked;

          if (needsClick) {
            choice.focus();
            choice.click();
            choice.dispatchEvent(new Event("change", { bubbles: true }));
            choice.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
      });

      didApplyAnswer = choices.some((c) => c && c.checked);
    }

    if (isAutomating) {
      if (!didApplyAnswer) {
        console.error("Automation error: AI answer did not match any choice.");
        try {
          console.log("AI responseText (raw):", responseText);
          console.log("AI response (parsed):", response);
          console.log("AI answers (normalized array):", answers);
        } catch (e) {}
        alert(
          "Auto-McGraw couldn't apply the AI answer to this question (no matching option). Automation has been stopped so you can answer manually."
        );
        isAutomating = false;
        return;
      }

      const highButtonSelector =
        '[data-automation-id="confidence-buttons--high_confidence"]';
      Promise.resolve()
        .then(() => new Promise((r) => setTimeout(r, 500)))
        .then(() => waitForElement(highButtonSelector, 10000))
        .then((button) => waitForEnabled(button, 8000).then(() => button))
        .then((button) => {
          if (!button) return;
          button.click();

          setTimeout(() => {
            const incorrectMarker = container.querySelector(
              ".awd-probe-correctness.incorrect"
            );
            if (incorrectMarker) {
              const correctionData = extractCorrectAnswer();
              if (correctionData && correctionData.answer) {
                lastIncorrectQuestion = correctionData.question;
                lastCorrectAnswer = cleanAnswer(correctionData.answer);
                console.log(
                  "Found incorrect answer. Correct answer is:",
                  lastCorrectAnswer
                );
              }
            }

            waitForNextButton(12000)
              .then((nextButton) => {
                nextButton.click();
                setTimeout(() => {
                  checkForNextStep();
                }, 1000);
              })
              .catch((error) => {
                console.error("Automation error:", error);
                // Retry once after a delay (e.g. local Ollama can return before UI is ready)
                setTimeout(() => {
                  if (!isAutomating) return;
                  waitForNextButton(15000)
                    .then((nextButton) => {
                      nextButton.click();
                      setTimeout(() => checkForNextStep(), 1000);
                    })
                    .catch((retryErr) => {
                      console.error("Automation error (retry):", retryErr);
                      isAutomating = false;
                    });
                }, 3000);
              });
          }, 2500);
        })
        .catch((error) => {
          console.error("Automation error:", error);
          isAutomating = false;
        });
    }
  } catch (e) {
    console.error("Error processing response:", e);
  }
}

function addAssistantButton() {
  waitForElement("awd-header .header__navigation").then((headerNav) => {
    const buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.marginLeft = "10px";

    chrome.storage.sync.get("aiModel", function (data) {
      const aiModel = data.aiModel || "chatgpt";
      let modelName = "ChatGPT";

      if (aiModel === "gemini") {
        modelName = "Gemini";
      } else if (aiModel === "deepseek") {
        modelName = "DeepSeek";
      } else if (aiModel === "ollama") {
        modelName = "Ollama";
      }

      const btn = document.createElement("button");
      btn.textContent = `Ask ${modelName}`;
      btn.classList.add("btn", "btn-secondary");
      btn.style.borderTopRightRadius = "0";
      btn.style.borderBottomRightRadius = "0";
      btn.addEventListener("click", () => {
        if (isAutomating) {
          isAutomating = false;
          chrome.storage.sync.get("aiModel", function (data) {
            const currentModel = data.aiModel || "chatgpt";
            let currentModelName = "ChatGPT";

            if (currentModel === "gemini") {
              currentModelName = "Gemini";
            } else if (currentModel === "deepseek") {
              currentModelName = "DeepSeek";
            } else if (currentModel === "ollama") {
              currentModelName = "Ollama";
            }

            btn.textContent = `Ask ${currentModelName}`;
          });
        } else {
          const proceed = confirm(
            "Start automated answering? Click OK to begin, or Cancel to stop."
          );
          if (proceed) {
            isAutomating = true;
            btn.textContent = "Stop Automation";
            checkForNextStep();
          }
        }
      });

      const settingsBtn = document.createElement("button");
      settingsBtn.classList.add("btn", "btn-secondary");
      settingsBtn.style.borderTopLeftRadius = "0";
      settingsBtn.style.borderBottomLeftRadius = "0";
      settingsBtn.style.borderLeft = "1px solid rgba(0,0,0,0.2)";
      settingsBtn.style.padding = "6px 10px";
      settingsBtn.title = "Auto-McGraw Settings";
      settingsBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
      `;
      settingsBtn.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "openSettings" });
      });

      buttonContainer.appendChild(btn);
      buttonContainer.appendChild(settingsBtn);
      headerNav.appendChild(buttonContainer);

      chrome.storage.onChanged.addListener((changes) => {
        if (changes.aiModel) {
          const newModel = changes.aiModel.newValue;
          let newModelName = "ChatGPT";

          if (newModel === "gemini") {
            newModelName = "Gemini";
          } else if (newModel === "deepseek") {
            newModelName = "DeepSeek";
          } else if (newModel === "ollama") {
            newModelName = "Ollama";
          }

          if (!isAutomating) {
            btn.textContent = `Ask ${newModelName}`;
          }
        }
      });
    });
  });
}

function parseQuestion() {
  const container = document.querySelector(".probe-container");
  if (!container) {
    alert("No question found on the page.");
    return null;
  }

  let questionType = "";
  if (container.querySelector(".awd-probe-type-multiple_choice")) {
    questionType = "multiple_choice";
  } else if (container.querySelector(".awd-probe-type-true_false")) {
    questionType = "true_false";
  } else if (container.querySelector(".awd-probe-type-multiple_select")) {
    questionType = "multiple_select";
  } else if (container.querySelector(".awd-probe-type-fill_in_the_blank")) {
    questionType = "fill_in_the_blank";
  } else if (container.querySelector(".awd-probe-type-matching")) {
    questionType = "matching";
  } else if (container.querySelector(".awd-probe-type-sortable")) {
    questionType = "ordering";
  }

  let questionText = "";
  const promptEl = container.querySelector(".prompt") ||
    document.querySelector(".sortable-component .prompt");

  if (questionType === "fill_in_the_blank" && promptEl) {
    const promptClone = promptEl.cloneNode(true);

    const uiSpans = promptClone.querySelectorAll(
      "span.fitb-span, span.blank-label, span.correctness, span._visuallyHidden"
    );
    uiSpans.forEach((span) => span.remove());

    const inputs = promptClone.querySelectorAll("input.fitb-input");
    inputs.forEach((input) => {
      const blankMarker = document.createTextNode("[BLANK]");
      if (input.parentNode) {
        input.parentNode.replaceChild(blankMarker, input);
      }
    });

    questionText = promptClone.textContent.trim();
  } else {
    questionText = promptEl ? promptEl.textContent.trim() : "";
  }

  let options = [];
  if (questionType === "matching") {
    const prompts = Array.from(
      container.querySelectorAll(".match-prompt .content")
    ).map((el) => el.textContent.trim());
    const choices = Array.from(
      container.querySelectorAll(".choices-container .content")
    ).map((el) => el.textContent.trim());
    options = { prompts, choices };
  } else if (questionType === "ordering") {
    const choiceItems = querySelectorAllIncludingShadow(".choice-item", container);
    choiceItems.forEach((item) => {
      const contentEl = item.querySelector(".content p") || item.querySelector(".content");
      if (contentEl) {
        options.push(contentEl.textContent.trim());
      }
    });
  } else if (questionType !== "fill_in_the_blank") {
    container.querySelectorAll(".choiceText").forEach((el) => {
      options.push(el.textContent.trim());
    });
  }

  return {
    type: questionType,
    question: questionText,
    options: options,
    previousCorrection: lastIncorrectQuestion
      ? {
          question: lastIncorrectQuestion,
          correctAnswer: lastCorrectAnswer,
        }
      : null,
  };
}

function querySelectorIncludingShadow(selector, root = document) {
  const el = root.querySelector(selector);
  if (el) return el;
  const walk = (node) => {
    if (!node || !node.querySelectorAll) return null;
    for (const child of node.querySelectorAll("*")) {
      if (child.shadowRoot) {
        const inShadow = child.shadowRoot.querySelector(selector);
        if (inShadow) return inShadow;
        const deep = walk(child.shadowRoot);
        if (deep) return deep;
      }
    }
    return null;
  };
  return walk(root);
}

function querySelectorAllIncludingShadow(selector, root) {
  const list = [];
  const collect = (node) => {
    if (!node || !node.querySelectorAll) return;
    node.querySelectorAll(selector).forEach((el) => list.push(el));
    node.querySelectorAll("*").forEach((child) => {
      if (child.shadowRoot) collect(child.shadowRoot);
    });
  };
  collect(root);
  return list;
}

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const el =
        document.querySelector(selector) || querySelectorIncludingShadow(selector);
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error("Element not found: " + selector));
      }
    }, 100);
  });
}

function waitForEnabled(button, timeout = 5000) {
  if (!button || !button.hasAttribute("disabled")) {
    return Promise.resolve(button);
  }
  return new Promise((resolve) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (!button.hasAttribute("disabled")) {
        clearInterval(interval);
        resolve(button);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        resolve(button);
      }
    }, 150);
  });
}

const NEXT_BUTTON_SELECTORS = [
  ".next-button",
  ".button-bar-wrapper .next-button",
  "awd-topic-overview-button-bar .next-button",
  '[data-automation-id*="next"]',
  'button[data-automation-id*="next"]',
  'a[data-automation-id*="next"]',
];

function findNextButton() {
  for (const sel of NEXT_BUTTON_SELECTORS) {
    const el =
      document.querySelector(sel) || querySelectorIncludingShadow(sel);
    if (el) return el;
  }
  const collectClickables = (root, list) => {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll("button, a.btn, [role='button']").forEach((el) => list.push(el));
    root.querySelectorAll("*").forEach((node) => {
      if (node.shadowRoot) collectClickables(node.shadowRoot, list);
    });
  };
  const clickables = [];
  collectClickables(document, clickables);
  const nextByText = clickables.find((el) => /^\s*next(\s+question)?\s*$/i.test((el.textContent || "").trim()));
  if (nextByText) return nextByText;
  return null;
}

function waitForNextButton(timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const el = findNextButton();
      if (el) {
        clearInterval(interval);
        resolve(el);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error("Next button not found"));
      }
    }, 150);
  });
}

setupMessageListener();
addAssistantButton();

if (isAutomating) {
  setTimeout(() => {
    checkForNextStep();
  }, 1000);
}
