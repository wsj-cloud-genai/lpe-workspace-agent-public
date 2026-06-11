# Google Apps Script Deployment & Setup Guide (clasp)

This guide explains how to manage, build, and deploy the Google Docs Add-on scripts locally and push them directly to Google Apps Script using **Google clasp (Command Line Apps Script Projects)**.

---

## 1. Prerequisites & Initial Configuration

Before running any deployment commands, ensure you have Node.js and npm installed, and the Apps Script API enabled.

### Step 1: Enable the Apps Script API
1. Navigate to your [Google Apps Script Settings](https://script.google.com/home/usersettings).
2. Toggle the **Google Apps Script API** setting to **ON** (Enabled). 
   *(Note: This is required for command-line access to Google Apps Script).*

### Step 2: Install clasp
You can install `@google/clasp` globally on your machine:
```bash
npm install -g @google/clasp
```
*Alternatively, you can run all commands without installing globally by prefixing them with `npx`, e.g., `npx @google/clasp push`.*

---

## 2. Authentication

You must authenticate clasp with your Google Account that has owner/editor access to the target Google Doc / Apps Script project.

Run the following command in your terminal:
```bash
clasp login
```
* This will open a browser window requesting access to your Google account.
* Click **Allow** to authorize clasp.
* Once logged in, clasp creates a global authentication credential file at `~/.clasprc.json`.

---

## 3. Working with Project Files

The Apps Script configuration files are located inside the `google-addon/` directory:
* `google-addon/.clasp.json`: Links the local folder to the online Google Apps Script project.
* `google-addon/appsscript.json`: Manifest file containing scopes, layout libraries, and sidebar trigger configurations.
* `*.gs` & `*.html`: The local implementation files of the Add-on sidebar and compilation logic.

> [!IMPORTANT]
> Always run your `clasp` commands from **inside** the `google-addon/` directory where the `.clasp.json` configuration file resides.

---

## 4. Clasp Commands Reference

### A. Deploying Local Changes (Push)
To push your local code changes to Google Apps Script, navigate to the `google-addon/` directory and execute:
```bash
# Push changes to the Apps Script project
clasp push

# Force push changes (overwriting any edits made in the online web editor)
clasp push -f
```

### B. Fetching Online Changes (Pull)
If someone makes changes directly in the Apps Script web editor, you can pull the latest files to your local repository:
```bash
clasp pull
```

### C. Check Deployment Status
To check which Apps Script project you are linked to and view its status:
```bash
clasp status
```

### D. Open Project in Web Editor
To quickly open the linked Apps Script editor in your browser:
```bash
clasp open
```

---

## 5. Troubleshooting Common Issues

### ❌ API Not Enabled Error
* **Error**: `User has not enabled the Apps Script API...`
* **Resolution**: Go to [script.google.com/home/usersettings](https://script.google.com/home/usersettings) and toggle the Apps Script API to **ON**.

### ❌ Authentication/Authorization Expired
* **Error**: `Authentication failed` or `Could not retrieve project credentials`.
* **Resolution**: Re-authenticate by logging out and logging in again:
  ```bash
  clasp logout
  clasp login
  ```

### ❌ Headless Authentication Failure
* **Error**: Running `clasp login` in a headless server or virtual terminal environment fails because a browser cannot be opened.
* **Resolution**: Log in on your host machine to generate `~/.clasprc.json`, and then copy the credentials file to the corresponding user home directory on your development environment.
