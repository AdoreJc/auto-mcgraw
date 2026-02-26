let mheTabId = null;
let aiTabId = null;
let aiType = null;
let lastActiveTabId = null;
let processingQuestion = false;
let mheWindowId = null;
let aiWindowId = null;

chrome.tabs.onActivated.addListener((activeInfo) => {
  lastActiveTabId = activeInfo.tabId;
});

function sendMessageWithRetry(tabId, message, maxAttempts = 3, delay = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function attemptSend() {
      attempts++;
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          if (attempts < maxAttempts) {
            setTimeout(attemptSend, delay);
          } else {
            reject(chrome.runtime.lastError);
          }
        } else {
          resolve(response);
        }
      });
    }

    attemptSend();
  });
}

async function focusTab(tabId) {
  if (!tabId) return false;

  try {
    const tab = await chrome.tabs.get(tabId);

    if (tab.windowId === chrome.windows.WINDOW_ID_CURRENT) {
      await chrome.tabs.update(tabId, { active: true });
      return true;
    }

    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tabId, { active: true });
    return true;
  } catch (error) {
    return false;
  }
}

async function findAndStoreTabs() {
  let mheTabs = await chrome.tabs.query({
    url: "https://learning.mheducation.com/*",
  });
  if (mheTabs.length === 0) {
    mheTabs = await chrome.tabs.query({
      url: "https://ezto.mheducation.com/*",
    });
  }
  if (mheTabs.length > 0) {
    mheTabId = mheTabs[0].id;
    mheWindowId = mheTabs[0].windowId;
  }

  const data = await chrome.storage.sync.get("aiModel");
  const aiModel = data.aiModel || "chatgpt";
  aiType = aiModel;

  if (aiModel === "chatgpt") {
    const tabs = await chrome.tabs.query({ url: "https://chatgpt.com/*" });
    if (tabs.length > 0) {
      aiTabId = tabs[0].id;
      aiWindowId = tabs[0].windowId;
    }
  } else if (aiModel === "gemini") {
    const tabs = await chrome.tabs.query({
      url: "https://gemini.google.com/*",
    });
    if (tabs.length > 0) {
      aiTabId = tabs[0].id;
      aiWindowId = tabs[0].windowId;
    }
  } else if (aiModel === "deepseek") {
    const tabs = await chrome.tabs.query({
      url: "https://chat.deepseek.com/*",
    });
    if (tabs.length > 0) {
      aiTabId = tabs[0].id;
      aiWindowId = tabs[0].windowId;
    }
  } else if (aiModel === "ollama") {
    aiTabId = null;
    aiWindowId = null;
  }
}

function formatQuestionPrompt(questionData) {
  const { type, question, options, previousCorrection } = questionData;
  let text = `Type: ${type}\nQuestion: ${question}`;

  if (
    previousCorrection &&
    previousCorrection.question &&
    previousCorrection.correctAnswer
  ) {
    text =
      `CORRECTION FROM PREVIOUS ANSWER: For the question "${
        previousCorrection.question
      }", your answer was incorrect. The correct answer was: ${JSON.stringify(
        previousCorrection.correctAnswer
      )}\n\nNow answer this new question:\n\n` + text;
  }

  if (type === "matching") {
    text +=
      "\nPrompts:\n" +
      options.prompts.map((prompt, i) => `${i + 1}. ${prompt}`).join("\n");
    text +=
      "\nChoices:\n" +
      options.choices.map((choice, i) => `${i + 1}. ${choice}`).join("\n");
    text +=
      "\n\nPlease match each prompt with the correct choice. Format your answer as an array where each element is 'Prompt -> Choice'.";
  } else if (type === "ordering") {
    text +=
      "\nItems to rank (first to last):\n" +
      options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");
    text +=
      "\n\nProvide the correct order from first to last. Your answer must be a JSON array of these exact item strings in the correct order (e.g. [\"first item\", \"second item\", ...]).";
  } else if (type === "fill_in_the_blank") {
    text +=
      "\n\nThis is a fill in the blank question. If there are multiple blanks, provide answers as an array in order of appearance. For a single blank, you can provide a string.";
  } else if (options && options.length > 0) {
    text +=
      "\nOptions:\n" + options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");
    text +=
      "\n\nIMPORTANT: Your answer must EXACTLY match one of the above options. Do not include numbers in your answer. If there are periods, include them.";
  }

  text +=
    '\n\nPlease provide your answer in JSON format with keys "answer" and "explanation". Use list to separate multiple answers. Explanations should be no more than one sentence. DO NOT acknowledge the correction in your response, only answer the new question.';

  return text;
}

async function callOllamaApi(model, prompt) {
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Ollama API error: ${res.status}`);
  }
  const data = await res.json();
  const content = data.message && data.message.content ? data.message.content : "";
  return normalizeOllamaResponse(content);
}

function normalizeOllamaResponse(rawText) {
  if (!rawText) {
    return JSON.stringify({ answer: "", explanation: "" });
  }

  let text = String(rawText)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();

  // Strip common code-fence wrappers
  text = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

  const tryParseAnswerObject = (candidate) => {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && "answer" in parsed) {
        const explanation =
          parsed.explanation != null ? String(parsed.explanation) : "";
        return JSON.stringify({ answer: parsed.answer, explanation });
      }
    } catch (e) {}
    return null;
  };

  const extractFirstJsonObject = (s) => {
    const start = s.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) {
          esc = false;
        } else if (ch === "\\\\") {
          esc = true;
        } else if (ch === '"') {
          inStr = false;
        }
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) return s.slice(start, i + 1);
      }
    }
    return null;
  };

  // 1) Best case: whole response is valid JSON
  const parsedWhole = tryParseAnswerObject(text);
  if (parsedWhole) return parsedWhole;

  // 2) Next best: response contains a JSON object substring
  const jsonObj = extractFirstJsonObject(text);
  if (jsonObj) {
    const parsedSub = tryParseAnswerObject(jsonObj);
    if (parsedSub) return parsedSub;
  }

  // 3) Extract "answer" and "explanation" (quoted / unquoted / arrays) and build valid JSON
  const extractValue = (key) => {
    // quoted string
    const quoted = new RegExp(
      '"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"',
      "i"
    );
    let m = text.match(quoted);
    if (m) return m[1].replace(/\\"/g, '"').trim();

    // array or object (valid JSON chunk)
    const arrayLike = new RegExp('"' + key + '"\\s*:\\s*(\\[[\\s\\S]*?\\])', "i");
    m = text.match(arrayLike);
    if (m) {
      try {
        return JSON.parse(m[1]);
      } catch (e) {
        // fall through
      }
    }

    // unquoted primitive-ish value (until comma/brace)
    const unquoted = new RegExp('"' + key + '"\\s*:\\s*([^,}\\n\\r]+)', "i");
    m = text.match(unquoted);
    if (m) return m[1].replace(/"\s*$/, "").trim();

    return "";
  };

  const answer = extractValue("answer");
  const explanation = extractValue("explanation");

  if (answer !== undefined && answer !== "" && answer !== "[") {
    return JSON.stringify({ answer, explanation: explanation || "" });
  }

  // 3) No JSON structure — wrap whole text as answer
  const safeAnswer = text.replace(/\s+/g, " ").trim();
  return JSON.stringify({ answer: safeAnswer, explanation: "" });
}

async function shouldFocusTabs() {
  await findAndStoreTabs();
  return mheWindowId === aiWindowId;
}

async function processQuestion(message) {
  if (processingQuestion) return;
  processingQuestion = true;

  try {
    await findAndStoreTabs();

    if (aiType === "ollama") {
      if (!mheTabId) mheTabId = message.sourceTabId;
      const { ollamaModel = "llama3" } = await chrome.storage.sync.get("ollamaModel");
      const prompt = formatQuestionPrompt(message.question);
      try {
        const response = await callOllamaApi(ollamaModel, prompt);
        await processResponse({ response });
      } catch (err) {
        if (mheTabId) {
          await sendMessageWithRetry(mheTabId, {
            type: "alertMessage",
            message: `Ollama error: ${err.message}. Is Ollama running at http://localhost:11434?`,
          });
        }
      }
      processingQuestion = false;
      return;
    }

    if (!aiTabId) {
      const messageText =
        aiType === "ollama"
          ? "Ollama is not reachable. Make sure it is running on this computer (http://localhost:11434)."
          : `Please open ${aiType} in another tab before using automation.`;

      await sendMessageWithRetry(mheTabId, {
        type: "alertMessage",
        message: messageText,
      });
      processingQuestion = false;
      return;
    }

    if (!mheTabId) {
      mheTabId = message.sourceTabId;
    }

    const sameWindow = await shouldFocusTabs();

    if (sameWindow) {
      await focusTab(aiTabId);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    await sendMessageWithRetry(aiTabId, {
      type: "receiveQuestion",
      question: message.question,
    });

    if (sameWindow && lastActiveTabId && lastActiveTabId !== aiTabId) {
      setTimeout(async () => {
        await focusTab(lastActiveTabId);
      }, 1000);
    }
  } catch (error) {
    if (mheTabId) {
      await sendMessageWithRetry(mheTabId, {
        type: "alertMessage",
        message:
          aiType === "ollama"
            ? "Error communicating with Ollama. Make sure it is running at http://localhost:11434."
            : `Error communicating with ${aiType}. Please make sure it's open in another tab.`,
      });
    }
  } finally {
    processingQuestion = false;
  }
}

async function processResponse(message) {
  try {
    if (!mheTabId) {
      let mheTabs = await chrome.tabs.query({
        url: "https://learning.mheducation.com/*",
      });
      if (mheTabs.length === 0) {
        mheTabs = await chrome.tabs.query({
          url: "https://ezto.mheducation.com/*",
        });
      }
      if (mheTabs.length > 0) {
        mheTabId = mheTabs[0].id;
        mheWindowId = mheTabs[0].windowId;
      } else {
        return;
      }
    }

    const sameWindow = await shouldFocusTabs();

    if (sameWindow) {
      await focusTab(mheTabId);
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    await sendMessageWithRetry(mheTabId, {
      type: "processChatGPTResponse",
      response: message.response,
    });
  } catch (error) {
    console.error("Error processing AI response:", error);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.tab) {
    message.sourceTabId = sender.tab.id;

    if (
      sender.tab.url.includes("learning.mheducation.com") ||
      sender.tab.url.includes("ezto.mheducation.com")
    ) {
      mheTabId = sender.tab.id;
      mheWindowId = sender.tab.windowId;
    } else if (sender.tab.url.includes("chatgpt.com")) {
      aiTabId = sender.tab.id;
      aiWindowId = sender.tab.windowId;
      aiType = "chatgpt";
    } else if (sender.tab.url.includes("gemini.google.com")) {
      aiTabId = sender.tab.id;
      aiWindowId = sender.tab.windowId;
      aiType = "gemini";
    } else if (sender.tab.url.includes("chat.deepseek.com")) {
      aiTabId = sender.tab.id;
      aiWindowId = sender.tab.windowId;
      aiType = "deepseek";
    }
  }

  if (message.type === "sendQuestionToChatGPT") {
    processQuestion(message);
    sendResponse({ received: true });
    return true;
  }

  if (
    message.type === "chatGPTResponse" ||
    message.type === "geminiResponse" ||
    message.type === "deepseekResponse" ||
    message.type === "ollamaResponse"
  ) {
    processResponse(message);
    sendResponse({ received: true });
    return true;
  }

  if (message.type === "openSettings") {
    chrome.windows.create({
      url: chrome.runtime.getURL("popup/settings.html"),
      type: "popup",
      width: 500,
      height: 520,
    });
    sendResponse({ received: true });
    return true;
  }

  sendResponse({ received: false });
  return false;
});

findAndStoreTabs();

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === mheTabId) mheTabId = null;
  if (tabId === aiTabId) aiTabId = null;
});
