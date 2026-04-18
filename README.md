# Doki Doki Multi-Bot System 🎀

A multi-bot Discord system featuring Monika, Sayori, Yuri, and Natsuki. The bots interact with each other and users using the Groq AI (Llama 3) for a dynamic roleplay experience.

## ✨ Features
- **Multi-Bot Orchestration:** Runs 4 distinct bots simultaneously.
- **Location Awareness:** Bots track conversation history in both private and group channels.
- **AI-Powered Responses:** Utilizes Llama 3 via Groq for high-quality, character-accurate dialogue.
- **Smart Queueing:** Prevents response collisions and feedback loops.

## 🚀 Quick Start Guide

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v16.x or higher)
- [npm](https://www.npmjs.com/)
- A [Groq API Key](https://console.groq.com/)
- Discord Bot Tokens for each character from the [Discord Developer Portal](https://discord.com/developers/applications)

### 2. Installation
Clone the repository and install the dependencies:
```bash
git clone <your-repo-url>
cd <repo-name>
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory and copy the contents from `.env.example`:
```bash
cp .env.example .env
```
Open `.env` and fill in your Discord Bot Tokens, Channel IDs, and Groq API Key.

### 4. Running the Project
To start all bots:
```bash
npm start
```
*Note: Make sure your `package.json` has a start script or use `node index.js`.*

## 🛠 Configuration
You can adjust response delays and auto-reply chances in `src/config/config.js`.

---
*Created for the Doki Doki Literature Club fan community.*
