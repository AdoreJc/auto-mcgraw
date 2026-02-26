document.addEventListener("DOMContentLoaded", function () {
  const chatgptButton = document.getElementById("chatgpt");
  const geminiButton = document.getElementById("gemini");
  const deepseekButton = document.getElementById("deepseek");
  const ollamaButton = document.getElementById("ollama");
  const ollamaOptions = document.getElementById("ollama-options");
  const ollamaModelSelect = document.getElementById("ollama-model");
  const statusMessage = document.getElementById("status-message");
  const currentVersionElement = document.getElementById("current-version");
  const latestVersionElement = document.getElementById("latest-version");
  const versionStatusElement = document.getElementById("version-status");
  const checkUpdatesButton = document.getElementById("check-updates");
  const footerVersionElement = document.getElementById("footer-version");

  const currentVersion = chrome.runtime.getManifest().version;
  currentVersionElement.textContent = `v${currentVersion}`;
  footerVersionElement.textContent = `v${currentVersion}`;

  checkForUpdates();

  checkUpdatesButton.addEventListener("click", checkForUpdates);

  async function fetchOllamaModels() {
    const select = ollamaModelSelect;
    select.innerHTML = "<option value=\"\">Loading models…</option>";
    try {
      const res = await fetch("http://localhost:11434/api/tags");
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      const models = (data.models || []).map((m) => m.name || m.model || "").filter(Boolean);
      select.innerHTML = models.length
        ? models.map((name) => `<option value="${name}">${name}</option>`).join("")
        : "<option value=\"\">No models found</option>";
      const { ollamaModel } = await chrome.storage.sync.get("ollamaModel");
      if (ollamaModel && models.includes(ollamaModel)) select.value = ollamaModel;
      else if (models.length) select.value = models[0];
    } catch (e) {
      select.innerHTML = "<option value=\"\">Ollama not running</option>";
    }
  }

  function showOllamaOptions(show) {
    ollamaOptions.style.display = show ? "block" : "none";
    if (show) fetchOllamaModels();
  }

  chrome.storage.sync.get(["aiModel", "ollamaModel"], function (data) {
    const currentModel = data.aiModel || "chatgpt";

    chatgptButton.classList.remove("active");
    geminiButton.classList.remove("active");
    deepseekButton.classList.remove("active");
    ollamaButton.classList.remove("active");

    if (currentModel === "chatgpt") {
      chatgptButton.classList.add("active");
    } else if (currentModel === "gemini") {
      geminiButton.classList.add("active");
    } else if (currentModel === "deepseek") {
      deepseekButton.classList.add("active");
    } else if (currentModel === "ollama") {
      ollamaButton.classList.add("active");
      showOllamaOptions(true);
    }

    checkModelAvailability(currentModel);
  });

  chatgptButton.addEventListener("click", function () {
    setActiveModel("chatgpt");
  });

  geminiButton.addEventListener("click", function () {
    setActiveModel("gemini");
  });

  deepseekButton.addEventListener("click", function () {
    setActiveModel("deepseek");
  });

  ollamaButton.addEventListener("click", function () {
    setActiveModel("ollama");
  });

  ollamaModelSelect.addEventListener("change", function () {
    const model = ollamaModelSelect.value;
    if (model) chrome.storage.sync.set({ ollamaModel: model });
  });

  function setActiveModel(model) {
    chrome.storage.sync.set({ aiModel: model }, function () {
      chatgptButton.classList.remove("active");
      geminiButton.classList.remove("active");
      deepseekButton.classList.remove("active");
      ollamaButton.classList.remove("active");

      if (model === "chatgpt") {
        chatgptButton.classList.add("active");
      } else if (model === "gemini") {
        geminiButton.classList.add("active");
      } else if (model === "deepseek") {
        deepseekButton.classList.add("active");
      } else if (model === "ollama") {
        ollamaButton.classList.add("active");
        showOllamaOptions(true);
      } else {
        showOllamaOptions(false);
      }

      checkModelAvailability(model);
    });
  }

  async function checkOllamaAvailable() {
    try {
      const res = await fetch("http://localhost:11434/api/tags");
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  function checkModelAvailability(currentModel) {
    statusMessage.textContent = "Checking assistant availability...";
    statusMessage.className = "";

    if (currentModel === "ollama") {
      checkOllamaAvailable().then((ok) => {
        if (ok) {
          statusMessage.textContent = "Ollama is running. Select a model above.";
          statusMessage.className = "success";
        } else {
          statusMessage.textContent =
            "Start Ollama on this computer (localhost:11434) to use local models.";
          statusMessage.className = "error";
        }
      });
      return;
    }

    chrome.tabs.query({ url: "https://chatgpt.com/*" }, (chatgptTabs) => {
      const chatgptAvailable = chatgptTabs.length > 0;

      chrome.tabs.query(
        { url: "https://gemini.google.com/*" },
        (geminiTabs) => {
          const geminiAvailable = geminiTabs.length > 0;

          chrome.tabs.query(
            { url: "https://chat.deepseek.com/*" },
            (deepseekTabs) => {
              const deepseekAvailable = deepseekTabs.length > 0;

              if (currentModel === "chatgpt") {
                if (chatgptAvailable) {
                  statusMessage.textContent =
                    "ChatGPT tab is open and ready to use.";
                  statusMessage.className = "success";
                } else {
                  statusMessage.textContent =
                    "Please open ChatGPT in another tab to use this assistant.";
                  statusMessage.className = "error";
                }
              } else if (currentModel === "gemini") {
                if (geminiAvailable) {
                  statusMessage.textContent =
                    "Gemini tab is open and ready to use.";
                  statusMessage.className = "success";
                } else {
                  statusMessage.textContent =
                    "Please open Gemini in another tab to use this assistant.";
                  statusMessage.className = "error";
                }
              } else if (currentModel === "deepseek") {
                if (deepseekAvailable) {
                  statusMessage.textContent =
                    "DeepSeek tab is open and ready to use.";
                  statusMessage.className = "success";
                } else {
                  statusMessage.textContent =
                    "Please open DeepSeek in another tab to use this assistant.";
                  statusMessage.className = "error";
                }
              }
            }
          );
        }
      );
    });
  }

  setInterval(() => {
    chrome.storage.sync.get("aiModel", function (data) {
      const currentModel = data.aiModel || "chatgpt";
      checkModelAvailability(currentModel);
    });
  }, 5000);

  async function checkForUpdates() {
    try {
      versionStatusElement.textContent = "Checking for updates...";
      versionStatusElement.className = "checking";
      checkUpdatesButton.disabled = true;
      latestVersionElement.textContent = "Checking...";

      const response = await fetch(
        "https://api.github.com/repos/GooglyBlox/auto-mcgraw/releases/latest"
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const releaseData = await response.json();
      const latestVersion = releaseData.tag_name.replace("v", "");
      latestVersionElement.textContent = `v${latestVersion}`;

      const currentVersionParts = currentVersion.split(".").map(Number);
      const latestVersionParts = latestVersion.split(".").map(Number);

      let isUpdateAvailable = false;

      for (
        let i = 0;
        i < Math.max(currentVersionParts.length, latestVersionParts.length);
        i++
      ) {
        const current = currentVersionParts[i] || 0;
        const latest = latestVersionParts[i] || 0;

        if (latest > current) {
          isUpdateAvailable = true;
          break;
        } else if (current > latest) {
          break;
        }
      }

      if (isUpdateAvailable) {
        versionStatusElement.textContent = `New version ${releaseData.tag_name} is available!`;
        versionStatusElement.className = "update-available";

        versionStatusElement.style.cursor = "pointer";
        versionStatusElement.onclick = () => {
          chrome.tabs.create({ url: releaseData.html_url });
        };
      } else {
        versionStatusElement.textContent = "You're using the latest version!";
        versionStatusElement.className = "up-to-date";
        versionStatusElement.style.cursor = "default";
        versionStatusElement.onclick = null;
      }
    } catch (error) {
      console.error("Error checking for updates:", error);
      versionStatusElement.textContent =
        "Error checking for updates. Please try again later.";
      versionStatusElement.className = "error";
      latestVersionElement.textContent = "Error";
    } finally {
      checkUpdatesButton.disabled = false;
    }
  }
});
