# Soul Wisdom Network: Developer Onboarding Guide

**Target Audience:** Tech Executives & New Developers
**Last Updated:** December 2025

---

## 1. Overview
This document provides a step-by-step guide to setting up your local development environment for the **Soul Wisdom Network**. By the end of this guide, you will be able to run the website on your local machine, make changes safely, and publish them to the live server.

## 2. Prerequisites (One-Time Setup)
Before you begin, ensure your computer has the following tools installed.

### 2.1 Install VS Code (The Editor)
We use **Visual Studio Code (VS Code)** as our Integrated Development Environment (IDE).
1.  Download from [code.visualstudio.com](https://code.visualstudio.com/).
2.  Install the application.
3.  *Recommended:* Install the **Antigravity** extension (or the relevant AI coding assistant provided by your organization) to enable the agentic features described in the workflow.

### 2.2 Install Node.js (The Runtime)
This project is built on **Next.js**, which runs on Node.js.
1.  Download **Node.js (LTS Version)** from [nodejs.org](https://nodejs.org/).
2.  Follow the installer prompts.
3.  Verify installation by opening a terminal (Command Prompt or Terminal app) and typing: `node -v` (Should see v20+).

### 2.3 Install Git (Version Control)
1.  Download from [git-scm.com](https://git-scm.com/).
2.  Follow the installer prompts.

### 2.4 GitHub Account
1.  Ensure you have a GitHub account.
2.  Ensure you have access to the repository: [https://github.com/masterytv/soulwisdomnetwork](https://github.com/masterytv/soulwisdomnetwork).

---

## 3. Setting Up the Project

### 3.1 Clone the Repository
This downloads the code from the cloud to your machine.
1.  Open **VS Code**.
2.  Open the Terminal in VS Code: **View > Terminal**.
3.  Navigate to where you want to keep the project (e.g., `cd Documents`).
4.  Run the clone command:
    ```bash
    git clone https://github.com/masterytv/soulwisdomnetwork.git
    ```
5.  Open the folder: **File > Open Folder...** and select `soulwisdomnetwork`.

### 3.2 Install Dependencies
This installs all the third-party libraries we use (like Tailwind CSS, Next.js, etc.).
1.  In the VS Code Terminal, run:
    ```bash
    npm install
    ```
2.  Wait for the process to complete.

---

## 4. Viewing the Website Locally
You can run a "local server" to see the website exactly as it looks on the web, but running privately on your computer.

1.  In the Terminal, run:
    ```bash
    npm run dev
    ```
2.  You will see a message like `Ready in 2.5s`.
3.  Open your web browser (Chrome/Safari) and go to: **[http://localhost:3000](http://localhost:3000)**.
4.  You are now viewing the live local version of the site!

> **Note:** Keep the terminal window open. If you close it, the site stops running. To stop it manually, press `Ctrl + C` in the terminal.

---

## 5. Making Changes (The Workflow)
We follow a strict safety protocol: **Branch -> Edit -> Verify -> Merge -> Deploy**.

### 5.1 Create a New Branch
Never edit the `main` branch directly. Create a "branch" for your specific task (e.g., "fixing-typo" or "update-colors").
1.  In Terminal:
    ```bash
    git checkout -b my-new-feature
    ```
    *(Replace `my-new-feature` with a descriptive name)*

### 5.2 Make Your Adjustments
1.  Use the **Explorer** on the left to find files.
    *   **Main Page:** `app/page.tsx`
    *   **Styles/Colors:** `app/globals.css`
    *   **Images:** `public/` folder
2.  Edit the code or ask your AI Agent: *"Please update the hero section to say 'Welcome Home'."*
3.  Save the file (`Cmd + S` or `Ctrl + S`).
4.  Look at your browser at `http://localhost:3000`. The page will refresh automatically with your changes.

### 5.3 Save ("Commit") Your Changes
Once you are happy with the changes:
1.  Stage the changes:
    ```bash
    git add .
    ```
2.  Commit (Save) them with a message:
    ```bash
    git commit -m "Updated the hero text description"
    ```

### 5.4 Push to GitHub
Upload your branch to the cloud so others can review it.
1.  Run:
    ```bash
    git push -u origin my-new-feature
    ```
2.  VS Code will provide a link to **Create a Pull Request** on GitHub. Click it to open GitHub in your browser.

---

## 6. Merging and Deploying
### 6.1 Pull Request (PR)
1.  On GitHub, review your changes.
2.  Click **"Create Pull Request"**.
3.  If everything looks good (and checks pass), click **"Merge Pull Request"**.

### 6.2 Deployment (Going Live)
Once the code is merged into the `main` branch, you can deploy it to the public web server.

1.  Switch back to the main branch locally:
    ```bash
    git checkout main
    git pull
    ```
    *(This ensures your local computer has the latest merged code)*

2.  Deploy to Firebase Hosting:
    ```bash
    npx firebase-tools deploy
    ```

3.  **Success!** The terminal will show the "Hosting URL" where your changes are now public.
    *   **Live Site:** [https://soulwisdomnewtwork.web.app](https://soulwisdomnewtwork.web.app)

---

## 7. Troubleshooting / AI Assistance
If you get stuck, you can ask the internal Agent:
*   *"I'm seeing an error when I run npm run dev."*
*   *"How do I change the color of this button?"*

The agent acts as your pair programmer and can fix most configuration issues automatically.
