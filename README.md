# ProSolv — local website

This project keeps the ProSolv structure from the uploaded `prosolv-single.pdf`: Home, Explore Problems, domain/problem pages, a 9-step BLU analysis, name-based welcome screen, and BLU chat. The server-side Gemini proxy keeps your API key out of browser code.

## 1. Requirements
- Node.js 18 or newer
- Internet connection for Gemini AI
- A Gemini API key for BLU chat and 9-step analysis

## 2. Start the website
Open this folder in VS Code. In Terminal, run:

```bash
npm start
```

Then open **http://localhost:3000** in your browser. Keep the terminal open while using the site.

## 3. Enable BLU with Gemini
Set `GEMINI_API_KEY` in the terminal before starting the server. Never paste your secret key into `app.js`, `index.html`, or any public website.

**Windows PowerShell:**
```powershell
$env:GEMINI_API_KEY="PASTE_YOUR_GEMINI_API_KEY_HERE"
npm start
```

**Windows Command Prompt (CMD):**
```cmd
set GEMINI_API_KEY=PASTE_YOUR_GEMINI_API_KEY_HERE
npm start
```

**macOS / Linux:**
```bash
export GEMINI_API_KEY="PASTE_YOUR_GEMINI_API_KEY_HERE"
npm start
```

Get/manage a key in Google AI Studio. API key usage may be subject to Google's quotas and billing terms. If the key is not set, the rest of the website still opens, but BLU and the analysis show a setup message.

## 4. Important
- `localhost` is available on the computer running the server. It is not a public internet link.
- Name sign-in is a local welcome feature, not a secure user account system.
- The included problem statements are sample content and can be edited in `data.js`.
- The uploaded source was a PDF printout of a JavaScript server rather than a directly runnable `.js` file, so this is a cleaned, runnable reconstruction of the visible app structure and backend behavior.
