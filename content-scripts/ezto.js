/**
 * Content script for ezto.mheducation.com quiz.
 * Parses question/options, sends to AI, applies answer, clicks Next only (no submit).
 */
let messageListener = null;
let isAutomating = false;

function setupMessageListener() {
  if (messageListener) {
    chrome.runtime.onMessage.removeListener(messageListener);
  }

  messageListener = (message, sender, sendResponse) => {
    if (message.type === "processChatGPTResponse") {
      processResponse(message.response);
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

function parseQuestion() {
  const questionEl = document.querySelector(".question-wrap .question, .question");
  if (!questionEl) return null;

  const questionText = questionEl.textContent.trim();
  if (!questionText) return null;

  const answersWrap = document.querySelector(".answers-wrap.multiple-choice");
  let type = "multiple_choice";
  let options = [];

  if (answersWrap) {
    const labels = answersWrap.querySelectorAll(".answer__label--mc");
    labels.forEach((label) => {
      const text = label.textContent.trim();
      if (text) options.push(text);
    });
  }

  return {
    type,
    question: questionText,
    options,
    previousCorrection: null,
  };
}

function getNextButton() {
  const nextBtn = document.querySelector(
    "button.footer__link--next:not(.is-disabled):not([disabled])"
  );
  return nextBtn || null;
}

function isLastQuestion() {
  const nextBtn = document.querySelector("button.footer__link--next");
  return nextBtn && (nextBtn.classList.contains("is-disabled") || nextBtn.disabled);
}

function applyAnswer(answerText) {
  const answersWrap = document.querySelector(".answers-wrap.multiple-choice");
  if (!answersWrap) return false;

  const choices = answersWrap.querySelectorAll('input[type="radio"], input[type="checkbox"]');
  if (!choices.length) return false;

  const normalize = (s) =>
    (s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\.$/, "");

  const normAnswer = normalize(
    typeof answerText === "string" ? answerText : String(answerText)
  );

  const answerMatchesChoice = (normChoice) => {
    if (normAnswer === normChoice) return true;
    const minLen = 8;
    if (normAnswer.length >= minLen && normChoice.includes(normAnswer)) return true;
    if (normChoice.length >= minLen && normAnswer.includes(normChoice)) return true;
    return false;
  };

  for (const choice of choices) {
    const label = choice.closest("label") || choice.closest(".answer-wrap--mc");
    const choiceText = label ? label.textContent.trim() : "";
    const normChoice = normalize(choiceText);
    if (!normChoice) continue;

    const shouldSelect = answerMatchesChoice(normChoice);
    const isCheckbox = choice.type === "checkbox";
    const needsClick = isCheckbox
      ? choice.checked !== shouldSelect
      : shouldSelect && !choice.checked;

    if (needsClick) {
      choice.focus();
      choice.click();
      choice.dispatchEvent(new Event("change", { bubbles: true }));
      choice.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
  }
  return false;
}

function processResponse(responseText) {
  try {
    const response = JSON.parse(responseText);
    const answers = Array.isArray(response.answer)
      ? response.answer
      : [response.answer];

    const answered = answers.some((a) => applyAnswer(a));

    if (isAutomating && answered) {
      const nextBtn = getNextButton();
      if (nextBtn) {
        setTimeout(() => {
          nextBtn.click();
          setTimeout(() => {
            if (isAutomating) checkForNextStep();
          }, 1200);
        }, 400);
      } else {
        isAutomating = false;
      }
    }
  } catch (e) {
    console.error("ezto processResponse error:", e);
  }
}

function checkForNextStep() {
  if (!isAutomating) return;
  const qData = parseQuestion();
  if (qData) {
    chrome.runtime.sendMessage({
      type: "sendQuestionToChatGPT",
      question: qData,
    });
  }
}

function buildBarAndAppendTo(container) {
  if (!container || document.getElementById("auto-mcgraw-ezto-bar")) return;
  const wrap = document.createElement("div");
  wrap.id = "auto-mcgraw-ezto-bar";
  wrap.style.cssText =
    "position:fixed;bottom:16px;right:16px;z-index:2147483647;display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border:1px solid #ccc;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-family:system-ui,sans-serif;";

  chrome.storage.sync.get("aiModel", (data) => {
    const aiModel = data.aiModel || "chatgpt";
    let modelName = aiModel === "gemini" ? "Gemini" : aiModel === "deepseek" ? "DeepSeek" : aiModel === "ollama" ? "Ollama" : "ChatGPT";

    const btn = document.createElement("button");
    btn.textContent = isAutomating ? "Stop" : `Ask ${modelName}`;
    btn.type = "button";
    btn.style.cssText =
      "padding:6px 12px;cursor:pointer;background:#0066cc;color:#fff;border:none;border-radius:4px;font-size:13px;";
    btn.addEventListener("click", () => {
      if (isAutomating) {
        isAutomating = false;
        chrome.storage.sync.get("aiModel", (d) => {
          btn.textContent = `Ask ${d.aiModel === "gemini" ? "Gemini" : d.aiModel === "deepseek" ? "DeepSeek" : d.aiModel === "ollama" ? "Ollama" : "ChatGPT"}`;
        });
        return;
      }
      if (confirm("Start automated quiz? Answer each question with AI and click Next (no submit). OK to start, Cancel to stop.")) {
        isAutomating = true;
        btn.textContent = "Stop";
        checkForNextStep();
      }
    });

    const settingsBtn = document.createElement("button");
    settingsBtn.type = "button";
    settingsBtn.title = "Settings";
    settingsBtn.style.cssText =
      "padding:4px 8px;cursor:pointer;background:transparent;border:1px solid #ccc;border-radius:4px;";
    settingsBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
    settingsBtn.addEventListener("click", () => chrome.runtime.sendMessage({ type: "openSettings" }));

    wrap.appendChild(btn);
    wrap.appendChild(settingsBtn);
    container.appendChild(wrap);

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.aiModel && !isAutomating) {
        const v = changes.aiModel.newValue;
        btn.textContent = `Ask ${v === "gemini" ? "Gemini" : v === "deepseek" ? "DeepSeek" : v === "ollama" ? "Ollama" : "ChatGPT"}`;
      }
    });
  });
}

function addAssistantButton() {
  function tryInject() {
    if (document.getElementById("auto-mcgraw-ezto-bar")) return;
    const body = document.body;
    if (body) {
      buildBarAndAppendTo(body);
      return;
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", tryInject);
    } else {
      setTimeout(tryInject, 50);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", tryInject);
  } else {
    tryInject();
  }
}

setupMessageListener();
addAssistantButton();
