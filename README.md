<div align="center">

# Auto-McGraw (Smartbook)

<img src="assets/icon.png" alt="Auto-McGraw Logo" width="200">

[![Release](https://img.shields.io/github/v/release/GooglyBlox/auto-mcgraw?include_prereleases&style=flat-square&cache=1)](https://github.com/GooglyBlox/auto-mcgraw/releases)
[![License](https://img.shields.io/github/license/GooglyBlox/auto-mcgraw?style=flat-square&cache=1)](LICENSE)
[![Issues](https://img.shields.io/github/issues/GooglyBlox/auto-mcgraw?style=flat-square&cache=1)](https://github.com/GooglyBlox/auto-mcgraw/issues)

*Automate McGraw Hill Smartbook and Connect (EZto) quizzes with AI (ChatGPT, Gemini & DeepSeek)*

[Installation](#installation) • [Usage](#usage) • [Supported platforms](#supported-platforms) • [Settings](#settings) • [Issues](#issues)

</div>

---

## Compatibility Notice

**⚠️ MacOS Users:** This extension may not work properly on MacOS due to platform-specific differences in Chrome extension behavior and system interactions. For the best experience, we recommend using this extension on Windows or Linux systems.

---

## Installation

1. Download the latest zip from the [releases page](https://github.com/GooglyBlox/auto-mcgraw/releases)
2. Extract the zip to a folder
3. Open Chrome (or another Chromium browser) and go to `chrome://extensions/`
4. Turn on **Developer mode** (top right)
5. Click **Load unpacked** and choose the extracted folder

## Supported platforms

- **McGraw Hill Smartbook** — [learning.mheducation.com](https://learning.mheducation.com): Smartbook reading assignments with embedded questions.
- **McGraw Hill Connect (EZto) quiz** — [ezto.mheducation.com](https://ezto.mheducation.com): Connect quizzes (multiple choice). *Added in latest release.*

The same AI assistant (ChatGPT, Gemini, or DeepSeek) is used for both. Choose your provider in [Settings](#settings).

## Usage

1. Log into your McGraw Hill account and open either:
   - A **Smartbook** assignment at learning.mheducation.com, or  
   - A **Connect (EZto) quiz** at ezto.mheducation.com
2. Log into one of the supported AI assistants in another tab:
   - [ChatGPT](https://chatgpt.com)
   - [Gemini](https://gemini.google.com)
   - [DeepSeek](https://chat.deepseek.com)
3. Click the **"Ask [AI Model]"** button on the page
4. Click **"OK"** when prompted to begin automation
5. The extension will:
   - Send each question to your chosen AI assistant and fill in answers
   - **Smartbook:** Handle multiple choice, true/false, and fill-in-the-blank; navigate forced learning sections when needed
   - **Quiz (EZto):** Handle multiple choice and advance through questions (you submit when ready). Please review the answer for questions with image or video, those will not send to chat bot.
   - **Matching questions (Smartbook only):** Cannot be automated. The extension shows AI-suggested matches in an alert; drag and drop them manually, then automation continues.

Click **"Stop Automation"** at any time to pause.

## Settings

Click the settings icon ( <img src="assets/settings-icon.svg" alt="Settings Icon" style="vertical-align: middle; width: 16px; height: 16px;"> ) next to the main button to:

- Select **ChatGPT**, **Gemini**, or **DeepSeek** for answering questions
- View connection status for each AI assistant
- Confirm your chosen assistant is ready before starting

Your selection applies to both Smartbook and Connect (EZto) quiz automation.

## Disclaimer

This tool is for educational purposes only. Use it responsibly and be aware of your institution's academic integrity policies.

## Issues

Found a bug? [Create an issue](https://github.com/GooglyBlox/auto-mcgraw/issues).
