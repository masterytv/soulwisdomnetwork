# **Soul Wisdom Network: Developer Onboarding Guide**

**Target Audience:** Tech Executives & New Developers **Last Updated:** December 2025

## **1\. Automatic Setup Overview**

* Download Antigravity. [https://antigravity.google/](https://antigravity.google/)   
* Open Antigravity and click Open Agent Manager in the top right corner of the screen.  
* Click Add Workspace (or open)  
* Add soulwisdom collective  
* In the chat make sure it’s in Planning mode with Gemini 3 Pro (High)  
* Enter the prompt below:

## **2\. Prompt for Antigravity Agent Manager**

@Agent, I am a new developer joining the \*\*Soul Wisdom Network\*\* project. I need you to act as the "SoulStack Architect" and set up my local environment according to our team's strict deployment protocols.

\*\*Phase 1: Clone & Install\*\*

1\.  \*\*Clone:\*\* Please clone the repository \`https://github.com/masterytv/soulwisdomnetwork\` into a new folder in my current workspace.

2\.  \*\*Dependencies:\*\* Once cloned, navigate into the folder and run \`npm install\` to grab our Next.js and Tailwind dependencies.

3\.  \*\*Verification:\*\* Run \`npm run dev\` to confirm the site boots up on \`localhost:3000\`.

\*\*Phase 2: Protocol Enforcement (Read Carefully)\*\*

I am uploading our "Manual Setup Overview" below. Please learn these rules and strictly enforce them for all my future tasks:

"""

OFFICIAL SOUL WISDOM WORKFLOW:

1\.  \*\*Branching:\*\* NEVER edit \`main\` directly. Always creating a new branch (e.g., \`git checkout \-b feature-name\`).

2\.  \*\*Commit Style:\*\* Stage changes (\`git add .\`) and commit with descriptive messages.

3\.  \*\*Deployment:\*\* We deploy to Firebase. The sequence is:

    \* Merge Pull Request on GitHub.

    \* Switch to main locally: \`git checkout main\`

    \* Pull latest: \`git pull\`

    \* Deploy: \`npx firebase-tools deploy\`

"""

\*\*Action:\*\*

Please execute Phase 1 now. Once the server is running, confirm you have internalized the Phase 2 workflow rules by summarizing the deployment command sequence back to me.

## **3\. Troubleshooting / AI Assistance**

If you get stuck, you can ask the internal Agent:

* *"I'm seeing an error when I run npm run dev."*  
* *"How do I change the color of this button?"*

The agent acts as your pair programmer and can fix most configuration issues automatically.

