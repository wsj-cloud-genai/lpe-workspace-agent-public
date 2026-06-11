/**
 * LPE Onboarding Folder Provisioner
 * Creates the Drive directory structure and pre-populates the briefing document.
 */

/**
 * Provisions a root folder, client subfolder, transcripts dropzone, and pre-filled briefing document.
 * @param {string} clientName - Name of the client (e.g. "Acme Corp")
 * @return {Object} Status containing URLs and IDs
 */
function provisionClientWorkspace(clientName, firstName, lastName, emails, domains) {
  if (!clientName || clientName.trim() === '') {
    return {
      success: false,
      error: 'Client Name is required.'
    };
  }
  
  try {
    const cleanClientName = clientName.trim();
    const rootFolderName = 'LPE Client Onboarding';
    
    // Generate a unique, URL-safe Client ID slug (lowercase letters, numbers, and hyphens)
    const clientIdBase = cleanClientName.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    
    // 1. Get or Create Root Folder
    let rootFolder;
    const rootFolders = DriveApp.getFoldersByName(rootFolderName);
    if (rootFolders.hasNext()) {
      rootFolder = rootFolders.next();
    } else {
      rootFolder = DriveApp.createFolder(rootFolderName);
    }
    
    // 2. Open or Create LPE Client Registry Spreadsheet
    const ss = getOrCreateRegistrySheet(rootFolder);
    const sheet = ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    // Prevent client ID collisions
    let finalClientId = clientIdBase;
    let counter = 1;
    let isDuplicate = true;
    while (isDuplicate) {
      isDuplicate = false;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === finalClientId) {
          finalClientId = clientIdBase + "-" + counter;
          counter++;
          isDuplicate = true;
          break;
        }
      }
    }
    
    // 3. Create Client Subfolder
    const clientFolder = rootFolder.createFolder(cleanClientName);
    
    // 4. Create Transcripts Dropzone
    const transcriptsFolder = clientFolder.createFolder('Transcripts');
    
    // 5. Create Campaign Briefing Google Doc
    const docName = cleanClientName + ' - Campaign Briefing';
    const doc = DocumentApp.create(docName);
    const docId = doc.getId();
    
    // 6. Populate Google Doc Template
    writeBriefingTemplate(docId, cleanClientName);
    
    // 7. Move Google Doc to Client Folder (created at root by default)
    const file = DriveApp.getFileById(docId);
    clientFolder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    
    // Auto-share client folder, transcripts folder, and briefing document with registry and root folder editors
    // (This ensures the backend Service Account has access to read the doc)
    try {
      const editors = ss.getEditors();
      const rootEditors = rootFolder.getEditors();
      const allEmails = {};
      editors.concat(rootEditors).forEach(user => {
        const email = user.getEmail();
        if (email) {
          allEmails[email] = true;
        }
      });
      for (const email in allEmails) {
        file.addEditor(email);
        clientFolder.addEditor(email);
        transcriptsFolder.addEditor(email);
      }
    } catch (shareErr) {
      console.warn("Failed to share provisioned workspace with registry editors:", shareErr);
    }
    
    // 8. Append to Google Sheets Registry
    const createdAt = new Date().toISOString();
    sheet.appendRow([
      finalClientId,
      cleanClientName,
      emails || "", // Associated Emails (comma separated)
      domains || "", // Associated Domains (comma separated)
      clientFolder.getId(),
      transcriptsFolder.getId(),
      createdAt,
      firstName || "", // Contact First Name (Column H)
      lastName || ""  // Contact Last Name (Column I)
     ]);
      
     // 9. Sync single onboarding event to Firestore via webhook
     syncClientToLPE(finalClientId, cleanClientName, clientFolder.getId(), transcriptsFolder.getId(), emails || "", domains || "", firstName || "", lastName || "");
    
    return {
      success: true,
      clientName: cleanClientName,
      clientId: finalClientId,
      folderUrl: clientFolder.getUrl(),
      folderId: clientFolder.getId(),
      docUrl: doc.getUrl(),
      docId: docId,
      transcriptsFolderUrl: transcriptsFolder.getUrl(),
      transcriptsFolderId: transcriptsFolder.getId()
    };
    
  } catch (error) {
    console.error('Error provisioning client workspace:', error);
    return {
      success: false,
      error: 'Failed to provision workspace: ' + error.message
    };
  }
}

/**
 * Gets or creates the master client registry spreadsheet inside the root onboarding folder.
 * @param {Folder} rootFolder - The root Google Drive folder
 * @return {Spreadsheet} The Google Spreadsheet object
 */
function getOrCreateRegistrySheet(rootFolder) {
  const sheetName = "LPE Client Registry";
  const files = rootFolder.getFilesByName(sheetName);
  
  let ss;
  if (files.hasNext()) {
    const file = files.next();
    ss = SpreadsheetApp.openById(file.getId());
  } else {
    ss = SpreadsheetApp.create(sheetName);
    const file = DriveApp.getFileById(ss.getId());
    rootFolder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    
    // Initialize standard registry columns
    const sheet = ss.getSheets()[0];
    sheet.appendRow([
      "Client ID",
      "Client Name",
      "Associated Emails",
      "Associated Domains",
      "Drive Folder ID",
      "Transcripts Folder ID",
      "Created At",
      "Contact First Name",
      "Contact Last Name",
      "Linked Meeting ID",
      "Linked Transcript File ID"
    ]);
    sheet.getRange(1, 1, 1, 11).setFontWeight("bold");
  }
  return ss;
}

/**
 * Updates the Linked Meeting ID for a specific client inside the LPE Client Registry Google Sheet.
 */
function updateClientMeetingIdInRegistry(clientId, meetId) {
  try {
    const rootFolderName = 'LPE Client Onboarding';
    const rootFolders = DriveApp.getFoldersByName(rootFolderName);
    if (!rootFolders.hasNext()) return;
    const rootFolder = rootFolders.next();
    const ss = getOrCreateRegistrySheet(rootFolder);
    const sheet = ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    // Find column index for "Linked Meeting ID"
    const headers = data[0];
    let colIndex = headers.indexOf("Linked Meeting ID");
    if (colIndex === -1) {
      colIndex = headers.length;
      sheet.getRange(1, colIndex + 1).setValue("Linked Meeting ID").setFontWeight("bold");
    }
    
    // Find row
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === clientId) {
        sheet.getRange(i + 1, colIndex + 1).setValue(meetId);
        break;
      }
    }
  } catch (e) {
    console.error("Failed to update Linked Meeting ID in client registry:", e);
  }
}

/**
 * Updates the Linked Transcript File ID for a specific client inside the LPE Client Registry Google Sheet.
 */
function updateClientTranscriptIdInRegistry(clientId, transcriptFileId) {
  try {
    const rootFolderName = 'LPE Client Onboarding';
    const rootFolders = DriveApp.getFoldersByName(rootFolderName);
    if (!rootFolders.hasNext()) return;
    const rootFolder = rootFolders.next();
    const ss = getOrCreateRegistrySheet(rootFolder);
    const sheet = ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    // Find column index for "Linked Transcript File ID"
    const headers = data[0];
    let colIndex = headers.indexOf("Linked Transcript File ID");
    if (colIndex === -1) {
      colIndex = headers.length;
      sheet.getRange(1, colIndex + 1).setValue("Linked Transcript File ID").setFontWeight("bold");
    }
    
    // Find row
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === clientId) {
        sheet.getRange(i + 1, colIndex + 1).setValue(transcriptFileId);
        break;
      }
    }
  } catch (e) {
    console.error("Failed to update Linked Transcript File ID in client registry:", e);
  }
}

/**
 * Triggers a real-time sync webhook back to the Flask API.
 * @return {boolean} Success status
 */
function syncClientToLPE(clientId, name, driveFolderId, transcriptsFolderId, emails, domains, firstName, lastName) {
  try {
    const config = getLPEConfig();
    if (!config) {
      console.warn("LPE API URL is not configured. Webhook sync skipped.");
      return false;
    }
    
    const url = config.apiUrl + "/api/adl/sync-registry";
    const payload = {
      clients: [{
        id: clientId,
        name: name,
        emails: emails ? emails.toString().split(",").map(e => e.trim()).filter(Boolean) : [],
        domains: domains ? domains.toString().split(",").map(d => d.trim()).filter(Boolean) : [],
        drive_folder_id: driveFolderId,
        transcripts_folder_id: transcriptsFolderId,
        contact_first_name: firstName || "",
        contact_last_name: lastName || ""
      }]
    };
    
    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "X-Api-Key": config.apiKey || ""
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    console.log("Client Registry webhook status code:", response.getResponseCode());
    return response.getResponseCode() === 200;
  } catch (error) {
    console.error("Failed to trigger client sync webhook:", error);
    return false;
  }
}

/**
 * Pulls all rows from the Client Registry spreadsheet and performs a batch sync to Firestore.
 * @return {Object} Status containing success, count, and error description
 */
function syncEntireRegistryToLPE() {
  try {
    const rootFolderName = 'LPE Client Onboarding';
    const rootFolders = DriveApp.getFoldersByName(rootFolderName);
    if (!rootFolders.hasNext()) {
      throw new Error("LPE Onboarding Root Folder does not exist yet. Please onboard a client first.");
    }
    const rootFolder = rootFolders.next();
    
    const sheetName = "LPE Client Registry";
    const files = rootFolder.getFilesByName(sheetName);
    if (!files.hasNext()) {
      throw new Error("LPE Client Registry Sheet does not exist yet. Please onboard a client first.");
    }
    
    const file = files.next();
    const ss = SpreadsheetApp.openById(file.getId());
    const sheet = ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    if (data.length <= 1) {
      return { success: true, count: 0, message: "Registry is empty." };
    }
    
    const clients = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const clientId = row[0];
      const name = row[1];
      const emails = row[2];
      const domains = row[3];
      const driveFolderId = row[4];
      const transcriptsFolderId = row[5];
      const contactFirstName = row[7] || "";
      const contactLastName = row[8] || "";
      
      if (!clientId || !name) continue;
      
      clients.push({
        id: clientId,
        name: name,
        emails: emails ? emails.toString().split(",").map(e => e.trim()).filter(Boolean) : [],
        domains: domains ? domains.toString().split(",").map(d => d.trim()).filter(Boolean) : [],
        drive_folder_id: driveFolderId,
        transcripts_folder_id: transcriptsFolderId,
        contact_first_name: contactFirstName,
        contact_last_name: contactLastName
      });
    }
    
    if (clients.length === 0) {
      return { success: true, count: 0, message: "No valid clients found in the registry." };
    }
    
    const config = getLPEConfig();
    if (!config) {
      return { success: false, error: "LPE API URL is not configured. Go to the Page Builder tab and configure connection first." };
    }
    
    const url = config.apiUrl + "/api/adl/sync-registry";
    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "X-Api-Key": config.apiKey || ""
      },
      payload: JSON.stringify({ clients: clients }),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200) {
      return { success: true, count: clients.length };
    } else {
      return { success: false, error: "Sync failed with status code " + responseCode + ": " + responseText };
    }
    
  } catch (error) {
    console.error("Registry batch sync crashed:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Pre-populates a Google Doc with the standard LPE Creative Brief template.
 * @param {string} docId - Google Doc ID
 * @param {string} clientName - Name of the client
 */
function writeBriefingTemplate(docId, clientName) {
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  
  // Clear default paragraphs
  body.clear();
  
  // Set margins (1 inch / 72 points)
  body.setMarginTop(72);
  body.setMarginBottom(72);
  body.setMarginLeft(72);
  body.setMarginRight(72);
  
  // Styles
  const titleStyle = {};
  titleStyle[DocumentApp.Attribute.FONT_FAMILY] = 'Roboto';
  titleStyle[DocumentApp.Attribute.FONT_SIZE] = 24;
  titleStyle[DocumentApp.Attribute.BOLD] = true;
  titleStyle[DocumentApp.Attribute.FOREGROUND_COLOR] = '#1a73e8';
  
  const subtitleStyle = {};
  subtitleStyle[DocumentApp.Attribute.FONT_FAMILY] = 'Roboto';
  subtitleStyle[DocumentApp.Attribute.FONT_SIZE] = 11;
  subtitleStyle[DocumentApp.Attribute.ITALIC] = true;
  subtitleStyle[DocumentApp.Attribute.FOREGROUND_COLOR] = '#5f6368';
  
  const headingStyle = {};
  headingStyle[DocumentApp.Attribute.FONT_FAMILY] = 'Roboto';
  headingStyle[DocumentApp.Attribute.FONT_SIZE] = 16;
  headingStyle[DocumentApp.Attribute.BOLD] = true;
  headingStyle[DocumentApp.Attribute.FOREGROUND_COLOR] = '#202124';
  headingStyle[DocumentApp.Attribute.SPACING_BEFORE] = 18;
  headingStyle[DocumentApp.Attribute.SPACING_AFTER] = 6;
  
  const textStyle = {};
  textStyle[DocumentApp.Attribute.FONT_FAMILY] = 'Roboto';
  textStyle[DocumentApp.Attribute.FONT_SIZE] = 10;
  textStyle[DocumentApp.Attribute.BOLD] = false;
  textStyle[DocumentApp.Attribute.FOREGROUND_COLOR] = '#3c4043';
  textStyle[DocumentApp.Attribute.LINE_SPACING] = 1.15;
  
  const fieldLabelStyle = {};
  fieldLabelStyle[DocumentApp.Attribute.BOLD] = true;
  fieldLabelStyle[DocumentApp.Attribute.FOREGROUND_COLOR] = '#202124';
  
  // Title
  const titlePara = body.appendParagraph(clientName + ' - Campaign Briefing')
      .setHeading(DocumentApp.ParagraphHeading.TITLE);
  styleParagraph(titlePara, titleStyle);
  
  // Subtitle / Intro
  const introPara = body.appendParagraph('This document contains the brand guidelines, copywriting directives, and key features for the campaign. The LPE Context Synthesizer Agent will analyze this document along with meeting transcripts to compile the campaign brief. Please fill in the brackets below.');
  styleParagraph(introPara, subtitleStyle);
  
  // Horizontal Rule
  body.appendHorizontalRule();
  
  // Section 1: Brand Guidelines
  const h1 = body.appendParagraph('1. Brand Guidelines')
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  styleParagraph(h1, headingStyle);
      
  const sub1 = body.appendParagraph('Enter visual identity tokens for page styling below. Ensure HEX codes are standard 6-character formats.');
  styleParagraph(sub1, subtitleStyle);
      
  appendField(body, 'Theme Mode (Dark / Light / Glassmorphism): ', 'Light', textStyle, fieldLabelStyle);
  appendField(body, 'Primary Accent Color (HEX): ', '#1A73E8', textStyle, fieldLabelStyle);
  appendField(body, 'Secondary Accent Color (HEX): ', '#34A853', textStyle, fieldLabelStyle);
  appendField(body, 'Heading Font Family (Inter / Outfit / Roboto / Sora): ', 'Roboto', textStyle, fieldLabelStyle);
  
  // Section 2: Hero Banner
  const h2 = body.appendParagraph('2. Hero Banner')
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  styleParagraph(h2, headingStyle);
      
  const sub2 = body.appendParagraph('Specify the above-the-fold value proposition and primary action.');
  styleParagraph(sub2, subtitleStyle);
      
  appendField(body, 'Core Headline Promise: ', 'Grow faster with ' + clientName + ' solutions', textStyle, fieldLabelStyle);
  appendField(body, 'Subheadline: ', 'Deploy high-converting landing pages tailored to your brand in seconds.', textStyle, fieldLabelStyle);
  appendField(body, 'CTA Action Label: ', 'Get Started', textStyle, fieldLabelStyle);
  appendField(body, 'CTA Link URL: ', 'https://' + clientName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com/start', textStyle, fieldLabelStyle);
  
  // Section 3: Product Features
  const h3 = body.appendParagraph('3. Product Features')
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  styleParagraph(h3, headingStyle);
      
  const sub3 = body.appendParagraph('Provide 2 to 6 key value propositions. Include title and detailed description for each.');
  styleParagraph(sub3, subtitleStyle);
      
  appendField(body, 'Feature 1 Title: ', '10x Faster Deployment', textStyle, fieldLabelStyle);
  appendField(body, 'Feature 1 Description: ', 'Our automated compiler takes structured briefs and compiles them into React components instantly.', textStyle, fieldLabelStyle);
  
  appendField(body, 'Feature 2 Title: ', 'Brand-Aligned Visuals', textStyle, fieldLabelStyle);
  appendField(body, 'Feature 2 Description: ', 'The context agent scans your documents and applies consistent styling to typography, colors, and layouts.', textStyle, fieldLabelStyle);
  
  appendField(body, 'Feature 3 Title: ', 'Autonomous Validation', textStyle, fieldLabelStyle);
  appendField(body, 'Feature 3 Description: ', 'An anomaly detection engine automatically flags style and copy contradictions before publishing.', textStyle, fieldLabelStyle);
  
  // Section 4: Customer Reviews
  const h4 = body.appendParagraph('4. Customer Reviews')
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
  styleParagraph(h4, headingStyle);
      
  const sub4 = body.appendParagraph('Provide client testimonials to show social proof on the page.');
  styleParagraph(sub4, subtitleStyle);
      
  appendField(body, 'Review 1 Name: ', 'Jane Doe', textStyle, fieldLabelStyle);
  appendField(body, 'Review 1 Rating (1-5): ', '5', textStyle, fieldLabelStyle);
  appendField(body, 'Review 1 Source (google / yelp / facebook / custom): ', 'google', textStyle, fieldLabelStyle);
  appendField(body, 'Review 1 Quote: ', 'The easiest campaign launch workflow we have ever experienced. We went from brief to live page in minutes.', textStyle, fieldLabelStyle);

  doc.saveAndClose();
}

/**
 * Styles a paragraph by dynamically separating paragraph-level and text-level formatting.
 * Handles invalid keys safely and provides descriptive error reporting.
 * @param {DocumentApp.Paragraph} paragraph - The paragraph element to style
 * @param {Object} style - The style object containing formatting parameters
 */
function styleParagraph(paragraph, style) {
  const paragraphAttributes = {};
  const textAttributes = {};
  
  for (let key in style) {
    if (!key || key === 'undefined' || key === 'null') {
      continue; // Skip invalid keys resulting from misspelled DocumentApp.Attribute constants
    }
    
    const attributeName = key.toString();
    // Identify paragraph-level formatting properties
    if (attributeName === 'SPACING_BEFORE' ||
        attributeName === 'SPACING_AFTER' ||
        attributeName === 'LINE_SPACING' ||
        attributeName === 'HORIZONTAL_ALIGNMENT' ||
        attributeName === 'INDENT_START' ||
        attributeName === 'INDENT_END' ||
        attributeName === 'INDENT_FIRST_LINE') {
      paragraphAttributes[key] = style[key];
    } else {
      textAttributes[key] = style[key];
    }
  }
  
  try {
    // Apply paragraph-level styles if any
    if (Object.keys(paragraphAttributes).length > 0) {
      paragraph.setAttributes(paragraphAttributes);
    }
  } catch (e) {
    console.error('Failed to set paragraph attributes:', paragraphAttributes, e);
    throw new Error('Paragraph styling error for keys: [' + Object.keys(paragraphAttributes).join(',') + ']. Error: ' + e.message);
  }
  
  try {
    // Apply text-level styles to the paragraph text element if any
    if (Object.keys(textAttributes).length > 0) {
      paragraph.editAsText().setAttributes(textAttributes);
    }
  } catch (e) {
    console.error('Failed to set text attributes:', textAttributes, e);
    throw new Error('Text styling error for keys: [' + Object.keys(textAttributes).join(',') + ']. Style Payload: ' + JSON.stringify(textAttributes) + '. Error: ' + e.message);
  }
}

/**
 * Helper to append a label-value field to the document body.
 */
function appendField(body, label, value, textStyle, labelStyle) {
  const p = body.appendParagraph('');
  p.setAttributes({ 'LINE_SPACING': textStyle['LINE_SPACING'] }); // Set paragraph property
  
  // Set text formatting via editAsText
  const text = p.editAsText();
  text.appendText(label);
  text.appendText(value);
  
  // Format the label as bold/color
  text.setAttributes(0, label.length - 1, labelStyle);
  
  // Format the value as plain style
  text.setAttributes(label.length, label.length + value.length - 1, textStyle);
}

/**
 * Lists events containing Google Meet links from the primary calendar.
 * Returns recent meetings from past 3 days and next 3 days.
 * @return {Array<Object>} List of meetings
 */
function getRecentMeetings() {
  try {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const futureLimit = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    const calendar = CalendarApp.getDefaultCalendar();
    if (!calendar) {
      console.warn("No default calendar found.");
      return [];
    }
    
    const events = calendar.getEvents(threeDaysAgo, futureLimit);
    const meetings = [];
    
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      let meetId = null;
      
      const searchTargets = [
        event.getLocation(),
        event.getDescription()
      ];
      
      for (let target of searchTargets) {
        if (target) {
          const match = target.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
          if (match) {
            meetId = match[1];
            break;
          }
        }
      }
      
      if (meetId) {
        meetings.push({
          meetId: meetId,
          title: event.getTitle() || "Untitled Meeting",
          time: event.getStartTime().toISOString()
        });
      }
    }
    
    // Sort descending by time
    meetings.sort((a, b) => new Date(b.time) - new Date(a.time));
    return meetings;
  } catch (error) {
    console.error("Error retrieving calendar events:", error);
    return [];
  }
}

/**
 * Helper to locate a Google Calendar event by Meet ID around a specific time.
 */
function findCalendarEventByMeetId(meetId, meetTimeStr) {
  try {
    const calendar = CalendarApp.getDefaultCalendar();
    if (!calendar) return null;
    
    // Search around meetTime (e.g. 1 day before to 1 day after to be safe)
    const meetTime = new Date(meetTimeStr);
    const startRange = new Date(meetTime.getTime() - 24 * 60 * 60 * 1000);
    const endRange = new Date(meetTime.getTime() + 24 * 60 * 60 * 1000);
    
    const events = calendar.getEvents(startRange, endRange);
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const searchTargets = [
        event.getLocation(),
        event.getDescription()
      ];
      for (let j = 0; j < searchTargets.length; j++) {
        const target = searchTargets[j];
        if (target && target.indexOf(meetId) !== -1) {
          return event;
        }
      }
    }
  } catch (e) {
    console.error("Error finding calendar event by meetId:", e);
  }
  return null;
}

/**
 * Links a Meet ID explicitly to a Client ID and logs it in the spreadsheet registry.
 * @return {boolean} Success status
 */
function linkMeetingToClient(meetId, clientId, meetTitle, meetTime) {
  try {
    if (!meetId || !clientId) {
      throw new Error("Missing meetId or clientId parameters.");
    }
    
    const rootFolderName = 'LPE Client Onboarding';
    const rootFolders = DriveApp.getFoldersByName(rootFolderName);
    if (!rootFolders.hasNext()) {
      throw new Error("LPE Onboarding Root Folder not found. Onboard a client first.");
    }
    const rootFolder = rootFolders.next();
    
    // Open registry spreadsheet
    const ss = getOrCreateRegistrySheet(rootFolder);
    
    // Open or create LPE Meetings Registry sheet
    let meetSheet = ss.getSheetByName("LPE Meetings Registry");
    if (!meetSheet) {
      meetSheet = ss.insertSheet("LPE Meetings Registry");
      meetSheet.appendRow([
        "Meet ID",
        "Client ID",
        "Event Title",
        "Event Time",
        "Synced At"
      ]);
      meetSheet.getRange(1, 1, 1, 5).setFontWeight("bold");
    }
    
    const data = meetSheet.getDataRange().getValues();
    let foundRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === meetId) {
        foundRow = i + 1; // 1-based index
        break;
      }
    }
    
    const now = new Date().toISOString();
    if (foundRow !== -1) {
      meetSheet.getRange(foundRow, 2).setValue(clientId);
      meetSheet.getRange(foundRow, 3).setValue(meetTitle);
      meetSheet.getRange(foundRow, 4).setValue(meetTime);
      meetSheet.getRange(foundRow, 5).setValue(now);
    } else {
      meetSheet.appendRow([
        meetId,
        clientId,
        meetTitle,
        meetTime,
        now
      ]);
    }
    
    // Fetch attendees from calendar event if found
    let attendees = [];
    try {
      const event = findCalendarEventByMeetId(meetId, meetTime);
      if (event) {
        const guestList = event.getGuestList();
        for (let i = 0; i < guestList.length; i++) {
          const guest = guestList[i];
          attendees.push({
            email: guest.getEmail(),
            name: guest.getName()
          });
        }
      }
    } catch (ex) {
      console.warn("Failed to extract calendar event guest list: " + ex.message);
    }
    
    // Update meeting ID in client registry
    updateClientMeetingIdInRegistry(clientId, meetId);
    
    // Trigger sync webhook back to Flask database
    return syncMeetingToLPE(meetId, clientId, meetTitle, meetTime, attendees);
  } catch (error) {
    console.error("Failed to link meeting to client registry:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Triggers meeting mapping synchronization back to the Flask API.
 */
function syncMeetingToLPE(meetId, clientId, title, time, attendees) {
  try {
    const config = getLPEConfig();
    if (!config) {
      return { success: false, error: "LPE API URL is not configured. Go to the Page Builder tab to set it." };
    }
    
    const url = config.apiUrl + "/api/adl/sync-meeting";
    const payload = {
      meet_id: meetId,
      client_id: clientId,
      title: title,
      start_time: time,
      attendees: attendees || []
    };
    
    const options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "X-Api-Key": config.apiKey || ""
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    if (code === 200) {
      return { success: true };
    } else {
      return { success: false, error: "Flask API returned status code " + code + ": " + response.getContentText() };
    }
  } catch (error) {
    console.error("Failed to trigger meeting sync webhook:", error);
    return { success: false, error: "Network Error: Google cloud servers could not reach " + (getLPEConfig() ? getLPEConfig().apiUrl : "API") + ". If running locally, you must use a public HTTPS tunnel (e.g. ngrok)." };
  }
}

/**
 * Gets a clean list of onboarded clients from the spreadsheet registry.
 * @return {Array<Object>} List of clients
 */
function getClientListFromRegistry() {
  try {
    const rootFolderName = 'LPE Client Onboarding';
    const rootFolders = DriveApp.getFoldersByName(rootFolderName);
    if (!rootFolders.hasNext()) {
      return [];
    }
    const rootFolder = rootFolders.next();
    const sheetName = "LPE Client Registry";
    const files = rootFolder.getFilesByName(sheetName);
    if (!files.hasNext()) {
      return [];
    }
    const file = files.next();
    const ss = SpreadsheetApp.openById(file.getId());
    const sheet = ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    const list = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[0] && row[1]) {
        list.push({
          id: row[0],
          name: row[1]
        });
      }
    }
    return list;
  } catch (error) {
    console.error("Failed to fetch client list from registry:", error);
    return [];
  }
}

/**
 * Helper to generate a random Google Meet-formatted ID.
 */
function generateRandomMeetId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const segment = (len) => {
    let s = '';
    for (let i = 0; i < len; i++) {
      s += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return s;
  };
  return segment(3) + '-' + segment(4) + '-' + segment(3);
}

/**
 * Creates a Google Calendar event with a generated Meet URL, and links it.
 * @return {Object} Status of the action
 */
function scheduleAndLinkMeeting(clientId, title, timeStr, guestEmail, description) {
  try {
    if (!clientId || !title || !timeStr) {
      throw new Error("Missing required parameters for scheduling.");
    }
    
    const calendarId = 'primary';
    const startTime = new Date(timeStr);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour default duration
    
    const baseDesc = description ? description.trim() : 'Campaign Kickoff and Creative Briefing Session.';
    
    // Build event resource for Calendar API
    const eventResource = {
      summary: title,
      description: baseDesc,
      start: {
        dateTime: startTime.toISOString()
      },
      end: {
        dateTime: endTime.toISOString()
      },
      conferenceData: {
        createRequest: {
          requestId: Utilities.getUuid(),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    };
    
    if (guestEmail && guestEmail.trim() !== '') {
      const emails = guestEmail.split(/[\s,]+/).filter(Boolean);
      eventResource.attendees = emails.map(email => ({ email: email }));
    }
    
    // Insert event with conferenceDataVersion set to 1 to auto-generate the Google Meet conference
    const event = Calendar.Events.insert(eventResource, calendarId, {
      conferenceDataVersion: 1,
      sendUpdates: guestEmail && guestEmail.trim() !== '' ? 'all' : 'none'
    });
    
    const meetUrl = event.hangoutLink;
    if (!meetUrl) {
      throw new Error("Google Calendar API failed to generate a Meet link. Please ensure Google Calendar has Meet integration enabled.");
    }
    
    // Parse meetId from hangoutLink (e.g. 'https://meet.google.com/abc-defg-hij' -> 'abc-defg-hij')
    const parts = meetUrl.split('/');
    const meetId = parts[parts.length - 1];
    
    // Update the event with the generated Meet URL in the location field
    try {
      event.location = meetUrl;
      // Add the Meet link explicitly in the description as well
      event.description = baseDesc + '\n\nGoogle Meet Link: ' + meetUrl;
      Calendar.Events.patch(event, calendarId, event.id);
    } catch (patchErr) {
      console.warn("Failed to patch event location/description:", patchErr);
    }
    
    // Link meeting using existing logic
    const linkRes = linkMeetingToClient(meetId, clientId, title, startTime.toISOString());
    
    if (linkRes.success) {
      return {
        success: true,
        meetId: meetId,
        meetUrl: meetUrl,
        title: title,
        time: startTime.toISOString(),
        eventUrl: event.htmlLink
      };
    } else {
      return {
        success: false,
        error: "Calendar event was created (" + meetUrl + "), but database sync failed: " + linkRes.error,
        meetUrl: meetUrl
      };
    }
  } catch (error) {
    console.error("Failed to schedule and link meeting:", error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Automates active doc onboarding ingestion, media sync, ADK audit, and LPE page compilation.
 * @return {Object} Compilation results
 */
function onboardAndCompileActiveDoc() {
  try {
    const config = getLPEConfig();
    if (!config) {
      return { success: false, error: "LPE API is not configured. Please connect in step 0 first." };
    }
    
    const doc = DocumentApp.getActiveDocument();
    if (!doc) {
      return { success: false, error: "No active document open." };
    }
    const docId = doc.getId();
    const docName = doc.getName();
    
    // Get registry spreadsheet
    const rootFolderName = 'LPE Client Onboarding';
    let rootFolder;
    const rootFolders = DriveApp.getFoldersByName(rootFolderName);
    if (rootFolders.hasNext()) {
      rootFolder = rootFolders.next();
    } else {
      return { success: false, error: "LPE Client Onboarding root folder not found." };
    }
    
    const ss = getOrCreateRegistrySheet(rootFolder);
    const sheet = ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    // Auto-share the active document with the editors of the registry spreadsheet and root folder
    // (This ensures the backend Service Account has access to read the doc)
    try {
      const activeFile = DriveApp.getFileById(docId);
      const editors = ss.getEditors();
      const rootEditors = rootFolder.getEditors();
      const allEmails = {};
      editors.concat(rootEditors).forEach(user => {
        const email = user.getEmail();
        if (email) {
          allEmails[email] = true;
        }
      });
      for (const email in allEmails) {
        activeFile.addEditor(email);
      }
    } catch (shareErr) {
      console.warn("Failed to auto-share active doc with registry editors:", shareErr);
    }
    
    let clientId = "";
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const folderId = row[4]; // Drive Folder ID
      if (folderId) {
        try {
          const folder = DriveApp.getFolderById(folderId);
          const files = folder.getFilesByName(docName);
          if (files.hasNext()) {
            clientId = row[0]; // Client ID
            break;
          }
        } catch (e) {
          // Skip
        }
      }
    }
    
    // Fallback name matching
    if (!clientId) {
      const namePrefix = docName.split(" - ")[0].toLowerCase().trim();
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[1].toLowerCase().trim() === namePrefix || row[0] === namePrefix) {
          clientId = row[0];
          break;
        }
      }
    }
    
    if (!clientId && data.length > 1) {
      clientId = data[1][0];
    }
    
    if (!clientId) {
      return { success: false, error: "Could not find a registered client for document name: '" + docName + "'" };
    }
    
    // Resolve meetId
    let meetId = "";
    try {
      const meetSheet = ss.getSheetByName("LPE Meetings Registry");
      if (meetSheet) {
        const meetData = meetSheet.getDataRange().getValues();
        for (let i = meetData.length - 1; i >= 1; i--) {
          if (meetData[i][1] === clientId) {
            meetId = meetData[i][0];
            break;
          }
        }
      }
    } catch (e) {}
    
    // Fetch already matched linkage details from backend if API is configured
    let transcriptFileId = "";
    if (config) {
      try {
        const clientUrl = config.apiUrl + "/api/adl/clients/" + clientId;
        const options = {
          method: "get",
          headers: {
            "X-Api-Key": config.apiKey || ""
          },
          muteHttpExceptions: true
        };
        const res = UrlFetchApp.fetch(clientUrl, options);
        if (res.getResponseCode() === 200) {
          const resObj = JSON.parse(res.getContentText());
          if (resObj && resObj.client) {
            if (resObj.client.meet_id) {
              meetId = resObj.client.meet_id;
            }
            if (resObj.client.transcript_file_id) {
              transcriptFileId = resObj.client.transcript_file_id;
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch client details from backend:", e);
      }
    }
    
    // 1. Run Onboarding scan
    const onboardUrl = config.apiUrl + "/api/adl/onboard";
    const onboardPayload = {
      docId: docId,
      clientId: clientId,
      meetId: meetId || undefined,
      transcriptFileId: transcriptFileId || undefined
    };
    
    const onboardOptions = {
      method: "post",
      contentType: "application/json",
      headers: {
        "X-Api-Key": config.apiKey || ""
      },
      payload: JSON.stringify(onboardPayload),
      muteHttpExceptions: true
    };
    
    const onboardRes = UrlFetchApp.fetch(onboardUrl, onboardOptions);
    const onboardCode = onboardRes.getResponseCode();
    const onboardBodyText = onboardRes.getContentText();
    
    if (onboardCode !== 201) {
      let errDetail = onboardBodyText;
      try {
        errDetail = JSON.parse(onboardBodyText).error || onboardBodyText;
      } catch(e){}
      return { success: false, error: "ADK Onboarding scan failed: " + errDetail };
    }
    
    const onboardData = JSON.parse(onboardBodyText);
    const requestId = onboardData.requestId;
    const adkStatus = onboardData.status;
    const anomalies = onboardData.anomalies || [];
    
    // 2. Immediately trigger compile
    const generateUrl = config.apiUrl + "/api/adl/requests/" + requestId + "/generate";
    const generateOptions = {
      method: "post",
      contentType: "application/json",
      headers: {
        "X-Api-Key": config.apiKey || ""
      },
      payload: JSON.stringify({}),
      muteHttpExceptions: true
    };
    
    const genRes = UrlFetchApp.fetch(generateUrl, generateOptions);
    const genCode = genRes.getResponseCode();
    const genBodyText = genRes.getContentText();
    
    if (genCode !== 200) {
      let errDetail = genBodyText;
      try {
        errDetail = JSON.parse(genBodyText).error || genBodyText;
      } catch(e){}
      return {
        success: false,
        error: "Generation compiler failed: " + errDetail,
        requestId: requestId,
        adkStatus: adkStatus,
        anomalies: anomalies
      };
    }
    
    const genData = JSON.parse(genBodyText);
    let baseUrl = config.apiUrl.replace(/\/api\/?$/, "");
    if (baseUrl.indexOf("cloudfunctions.net") !== -1 || baseUrl.indexOf("run.app") !== -1) {
      baseUrl = "https://cloud-genai.com";
    }
    const previewUrl = baseUrl + "/drafts/" + requestId;
    
    return {
      success: true,
      requestId: requestId,
      adkStatus: adkStatus,
      anomalies: anomalies,
      previewUrl: previewUrl,
      pageId: "ai-generated-draft"
    };
    
  } catch (error) {
    console.error("Failed to onboard and compile document:", error);
    return { success: false, error: "Apps Script Error: " + error.message };
  }
}

/**
 * Auto-detects the client associated with the active Google Doc by checking name/folder.
 * @return {string} Client ID or empty string
 */
function getDocumentClient() {
  try {
    const doc = DocumentApp.getActiveDocument();
    if (!doc) {
      return "";
    }
    const docName = doc.getName();
    
    // Get registry spreadsheet
    const rootFolderName = 'LPE Client Onboarding';
    const rootFolders = DriveApp.getFoldersByName(rootFolderName);
    if (!rootFolders.hasNext()) {
      return "";
    }
    const rootFolder = rootFolders.next();
    const ss = getOrCreateRegistrySheet(rootFolder);
    const sheet = ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    let clientId = "";
    // Check drive folder matching
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const folderId = row[4]; // Drive Folder ID
      if (folderId) {
        try {
          const folder = DriveApp.getFolderById(folderId);
          const files = folder.getFilesByName(docName);
          if (files.hasNext()) {
            clientId = row[0]; // Client ID
            break;
          }
        } catch (e) {
          // Skip
        }
      }
    }
    
    // Fallback name matching
    if (!clientId) {
      const namePrefix = docName.split(" - ")[0].toLowerCase().trim();
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[1].toLowerCase().trim() === namePrefix || row[0] === namePrefix) {
          clientId = row[0];
          break;
        }
      }
    }
    
    // Default fallback to first client
    if (!clientId && data.length > 1) {
      clientId = data[1][0];
    }
    
    return clientId;
  } catch (error) {
    console.error("Failed to auto-detect document client:", error);
    return "";
  }
}

/**
 * Fetches the onboarding status of the active document (client, linked meeting, and transcript status).
 * @return {Object} Status object
 */
function getActiveDocOnboardingStatus(overrideClientId) {
  try {
    const doc = DocumentApp.getActiveDocument();
    if (!doc) {
      return { clientFound: false, docName: "No active document open" };
    }
    const docName = doc.getName();
    
    // Get registry spreadsheet
    const rootFolderName = 'LPE Client Onboarding';
    const rootFolders = DriveApp.getFoldersByName(rootFolderName);
    if (!rootFolders.hasNext()) {
      return { clientFound: false, docName: docName, error: "Root folder 'LPE Client Onboarding' not found" };
    }
    const rootFolder = rootFolders.next();
    const ss = getOrCreateRegistrySheet(rootFolder);
    const sheet = ss.getSheets()[0];
    const data = sheet.getDataRange().getValues();
    
    let clientId = "";
    let clientName = "";
    let driveFolderId = "";
    let transcriptsFolderId = "";
    
    // If overrideClientId is provided, locate client by ID in the registry
    if (overrideClientId) {
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[0] === overrideClientId) {
          clientId = row[0];
          clientName = row[1];
          driveFolderId = row[4];
          transcriptsFolderId = row[5];
          break;
        }
      }
    }
    
    // If still not resolved, check drive folder matching
    if (!clientId) {
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const folderId = row[4]; // Drive Folder ID
        if (folderId) {
          try {
            const folder = DriveApp.getFolderById(folderId);
            const files = folder.getFilesByName(docName);
            if (files.hasNext()) {
              clientId = row[0];
              clientName = row[1];
              driveFolderId = folderId;
              transcriptsFolderId = row[5];
              break;
            }
          } catch (e) {}
        }
      }
    }
    
    // Fallback name matching
    if (!clientId) {
      const namePrefix = docName.split(" - ")[0].toLowerCase().trim();
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (row[1].toLowerCase().trim() === namePrefix || row[0] === namePrefix) {
          clientId = row[0];
          clientName = row[1];
          driveFolderId = row[4];
          transcriptsFolderId = row[5];
          break;
        }
      }
    }
    
    if (!clientId && data.length > 1) {
      clientId = data[1][0];
      clientName = data[1][1];
      driveFolderId = data[1][4];
      transcriptsFolderId = data[1][5];
    }
    
    if (!clientId) {
      return { clientFound: false, docName: docName, error: "No registered client matches doc name prefix" };
    }
    
    // Resolve meetId
    let meetingLinked = false;
    let meetId = "";
    let meetTitle = "";
    try {
      const meetSheet = ss.getSheetByName("LPE Meetings Registry");
      if (meetSheet) {
        const meetData = meetSheet.getDataRange().getValues();
        for (let i = meetData.length - 1; i >= 1; i--) {
          if (meetData[i][1] === clientId) {
            meetId = meetData[i][0];
            meetTitle = meetData[i][2]; // Title
            meetingLinked = true;
            break;
          }
        }
      }
    } catch (e) {}
    
    // Resolve transcript status from backend (which is updated directly by the backend upon human reconciliation)
    let transcriptFound = false;
    let transcriptFileName = "";
    let transcriptFileId = "";

    const config = getLPEConfig();
    let backendMeetId = "";
    let backendTranscriptFileId = "";
    if (config && clientId) {
      try {
        const clientUrl = config.apiUrl + "/api/adl/clients/" + clientId;
        const options = {
          method: "get",
          headers: {
            "X-Api-Key": config.apiKey || ""
          },
          muteHttpExceptions: true
        };
        const res = UrlFetchApp.fetch(clientUrl, options);
        if (res.getResponseCode() === 200) {
          const resObj = JSON.parse(res.getContentText());
          if (resObj && resObj.client) {
            backendMeetId = resObj.client.meet_id || "";
            backendTranscriptFileId = resObj.client.transcript_file_id || "";
          }
        }
      } catch (e) {
        console.error("Failed to fetch client details from backend:", e);
      }
    }

    if (backendMeetId) {
      meetId = backendMeetId;
      meetingLinked = true;
    }
    if (backendTranscriptFileId) {
      transcriptFileId = backendTranscriptFileId;
      transcriptFound = true;
      try {
        transcriptFileName = DriveApp.getFileById(transcriptFileId).getName();
      } catch (e) {
        transcriptFileName = "Matched Transcript (" + transcriptFileId + ")";
      }
    }
    
    return {
      docName: docName,
      clientFound: true,
      clientName: clientName,
      clientId: clientId,
      meetingLinked: meetingLinked,
      meetId: meetId,
      meetTitle: meetTitle,
      transcriptFound: transcriptFound,
      transcriptFileName: transcriptFileName,
      transcriptFileId: transcriptFileId
    };
  } catch (error) {
    return { clientFound: false, error: error.message };
  }
}

/**
 * Reads and parses proposals from the 'Proposal' tab of the active Google Doc.
 * @return {Array<Object>} List of proposals
 */
function getProposalsFromDoc() {
  try {
    const doc = DocumentApp.getActiveDocument();
    if (!doc) {
      return [];
    }
    const docId = doc.getId();
    
    // Call Docs API directly using UrlFetchApp to read tabs
    const url = 'https://docs.googleapis.com/v1/documents/' + docId + '?includeTabsContent=true';
    const response = UrlFetchApp.fetch(url, {
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
      }
    });
    
    if (response.getResponseCode() !== 200) {
      throw new Error('Failed to fetch document content via REST API: ' + response.getContentText());
    }
    
    const docData = JSON.parse(response.getContentText());
    const tabs = docData.tabs || [];
    
    // Find Proposal tab
    let proposalTab = null;
    function findTabByTitle(tabList, title) {
      for (let i = 0; i < tabList.length; i++) {
        const tab = tabList[i];
        if (tab.tabProperties && tab.tabProperties.title === title) {
          return tab;
        }
        if (tab.childTabs) {
          const found = findTabByTitle(tab.childTabs, title);
          if (found) return found;
        }
      }
      return null;
    }
    
    proposalTab = findTabByTitle(tabs, 'Proposal');
    if (!proposalTab) {
      return [];
    }
    
    // Extract text from the Proposal tab
    let text = '';
    const docTab = proposalTab.documentTab || {};
    const bodyContent = (docTab.body && docTab.body.content) || [];
    bodyContent.forEach(function(element) {
      if (element.paragraph) {
        element.paragraph.elements.forEach(function(el) {
          if (el.textRun) {
            text += el.textRun.content;
          }
        });
      }
    });
    
    // Parse proposals
    const lines = text.split('\n');
    const proposals = [];
    lines.forEach(function(line) {
      line = line.trim();
      if (!line) return;
      
      const parts = line.split('|');
      if (parts.length >= 6) {
        proposals.push({
          id: parts[0],
          type: parts[1],
          label: parts[2],
          old_value: parts[3],
          new_value: parts[4],
          insert_after_label: parts[5],
          reason: parts[6] || ''
        });
      } else if (parts.length === 5) {
        proposals.push({
          id: parts[0],
          type: parts[1],
          label: parts[2],
          old_value: parts[3],
          new_value: parts[4],
          insert_after_label: '',
          reason: ''
        });
      }
    });
    
    return proposals;
  } catch (error) {
    console.error('Error fetching proposals:', error);
    throw new Error('Could not load proposals: ' + error.message);
  }
}

/**
 * Applies a specific proposal by ID to the document, and removes it from the registry.
 * @param {string} proposalId - The proposal ID to approve (e.g. PROP-1)
 * @return {Object} Status of the operation
 */
function applyDocProposal(proposalId) {
  try {
    const doc = DocumentApp.getActiveDocument();
    if (!doc) {
      return { success: false, error: 'No active document.' };
    }
    const docId = doc.getId();
    
    // 1. Get all current proposals
    const proposals = getProposalsFromDoc();
    let targetProp = null;
    const remainingProposals = [];
    
    proposals.forEach(function(p) {
      if (p.id === proposalId) {
        targetProp = p;
      } else {
        remainingProposals.push(p);
      }
    });
    
    if (!targetProp) {
      return { success: false, error: 'Proposal ' + proposalId + ' not found in document.' };
    }
    
    // 2. Modify the document's main tab content
    const body = doc.getBody();
    
    // Try to find the marker first
    const markerPattern = '\\[' + proposalId + '\\]';
    const match = body.findText(markerPattern);
    
    if (match) {
      const textElement = match.getElement().asText();
      const parentElement = textElement.getParent();
      
      if (targetProp.type === 'remove') {
        // If type is remove, remove the entire paragraph/list item
        parentElement.removeFromParent();
      } else {
        // replace or add: do the text replacement
        const pText = parentElement.getText();
        const labelIdx = pText.indexOf(targetProp.label);
        
        if (labelIdx !== -1) {
          const valStart = labelIdx + targetProp.label.length;
          const markerStr = ' [' + proposalId + ']';
          const markerIdx = pText.indexOf(markerStr);
          
          if (markerIdx !== -1) {
            const markerEnd = markerIdx + markerStr.length - 1;
            
            // Perform edit via Text API to keep styling
            const textObj = parentElement.editAsText();
            textObj.deleteText(valStart, markerEnd);
            textObj.insertText(valStart, targetProp.new_value);
            
            // Clear yellow background color highlight on the new value range
            textObj.setBackgroundColor(valStart, valStart + targetProp.new_value.length - 1, null);
          }
        }
      }
    } else if (targetProp.type === 'add') {
      // If no marker found, but it's an add type, try to find the label first
      const labelMatch = body.findText(escapeRegex(targetProp.label));
      if (labelMatch) {
        const textElement = labelMatch.getElement().asText();
        const parentElement = textElement.getParent();
        const pText = parentElement.getText();
        const labelIdx = pText.indexOf(targetProp.label);
        const valStart = labelIdx + targetProp.label.length;
        
        const textObj = parentElement.editAsText();
        textObj.insertText(valStart, targetProp.new_value);
        textObj.setBackgroundColor(valStart, valStart + targetProp.new_value.length - 1, null);
      } else {
        // Find the ideal placement heading or label determined dynamically by the AI agent
        let insertMatch = null;
        if (targetProp.insert_after_label) {
          insertMatch = body.findText(escapeRegex(targetProp.insert_after_label));
        }
        
        if (insertMatch) {
          const textEl = insertMatch.getElement();
          const parentP = textEl.getParent();
          const childIdx = body.getChildIndex(parentP);
          
          // Insert a new paragraph right after the heading or label matched
          const newP = body.insertParagraph(childIdx + 1, '');
          const textObj = newP.editAsText();
          let fullLabel = targetProp.label;
          if (fullLabel && !fullLabel.endsWith(' ')) {
            fullLabel += ' ';
          }
          textObj.appendText(fullLabel).setBold(true);
          textObj.appendText(targetProp.new_value).setBold(false);
        } else {
          // Fallback: Append at the bottom of the main document
          const newP = body.appendParagraph('');
          const textObj = newP.editAsText();
          let fullLabel = targetProp.label;
          if (fullLabel && !fullLabel.endsWith(' ')) {
            fullLabel += ' ';
          }
          textObj.appendText(fullLabel).setBold(true);
          textObj.appendText(targetProp.new_value).setBold(false);
        }
      }
    } else {
      return { success: false, error: 'Could not locate marker or label for proposal ' + proposalId };
    }
    
    // Save document changes to make them visible immediately
    doc.saveAndClose();
    
    // 3. Update or delete the Proposal tab
    updateProposalTab(docId, remainingProposals);
    
    return { success: true };
  } catch (error) {
    console.error('Error applying proposal:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Ignores a specific proposal by ID, deletes its marker and highlights from the document,
 * and removes it from the staged Proposal tab registry.
 * @param {string} proposalId - The proposal ID to ignore (e.g. PROP-1)
 * @return {Object} Status of the operation
 */
function ignoreDocProposal(proposalId) {
  try {
    const doc = DocumentApp.getActiveDocument();
    if (!doc) {
      return { success: false, error: 'No active document.' };
    }
    const docId = doc.getId();
    
    // 1. Get all current proposals
    const proposals = getProposalsFromDoc();
    let targetProp = null;
    const remainingProposals = [];
    
    proposals.forEach(function(p) {
      if (p.id === proposalId) {
        targetProp = p;
      } else {
        remainingProposals.push(p);
      }
    });
    
    if (!targetProp) {
      return { success: false, error: 'Proposal ' + proposalId + ' not found in document.' };
    }
    
    // 2. Clean up marker and yellow highlight in the document
    const body = doc.getBody();
    const markerPattern = '\\[' + proposalId + '\\]';
    const match = body.findText(markerPattern);
    
    if (match) {
      const textElement = match.getElement().asText();
      const parentElement = textElement.getParent();
      const pText = parentElement.getText();
      const markerStr = ' [' + proposalId + ']';
      const markerIdx = pText.indexOf(markerStr);
      
      if (markerIdx !== -1) {
        const markerEnd = markerIdx + markerStr.length - 1;
        const textObj = parentElement.editAsText();
        
        // Delete the marker string
        textObj.deleteText(markerIdx, markerEnd);
        
        // Attempt to clear background highlight starting from value start to the end of the text
        const labelIdx = pText.indexOf(targetProp.label);
        if (labelIdx !== -1) {
          const valStart = labelIdx + targetProp.label.length;
          if (markerIdx > valStart) {
            textObj.setBackgroundColor(valStart, markerIdx - 1, null);
          }
        } else {
          // Fallback: Clear background on the entire remaining text in the element
          textObj.setBackgroundColor(0, pText.length - 1 - markerStr.length, null);
        }
      }
    }
    
    // Save document changes to make them visible immediately
    doc.saveAndClose();
    
    // 3. Update or delete the Proposal tab
    updateProposalTab(docId, remainingProposals);
    
    return { success: true };
  } catch (error) {
    console.error('Error ignoring proposal:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Updates or deletes the Proposal document tab based on remaining proposals.
 * @param {string} docId - The active document ID
 * @param {Array<Object>} remainingProposals - The remaining proposals to write
 */
function updateProposalTab(docId, remainingProposals) {
  // 1. Find the Proposal tab
  const url = 'https://docs.googleapis.com/v1/documents/' + docId + '?includeTabsContent=true';
  const response = UrlFetchApp.fetch(url, {
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    }
  });
  const docData = JSON.parse(response.getContentText());
  
  let existingTabId = null;
  if (docData.tabs) {
    for (let i = 0; i < docData.tabs.length; i++) {
      const tab = docData.tabs[i];
      if (tab.tabProperties && tab.tabProperties.title === 'Proposal') {
        existingTabId = tab.tabProperties.tabId;
        break;
      }
    }
  }
  
  const requests = [];
  if (existingTabId) {
    requests.push({ deleteTab: { tabId: existingTabId } });
  }
  
  if (remainingProposals.length > 0) {
    // Re-create the Proposal tab
    requests.push({
      addDocumentTab: {
        tabProperties: {
          title: 'Proposal'
        }
      }
    });
  }
  
  if (requests.length > 0) {
    const updateUrl = 'https://docs.googleapis.com/v1/documents/' + docId + ':batchUpdate';
    const res = UrlFetchApp.fetch(updateUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
      },
      payload: JSON.stringify({ requests: requests })
    });
    
    // If we recreated it, write the text
    if (remainingProposals.length > 0) {
      const resData = JSON.parse(res.getContentText());
      // The addDocumentTab response is the last reply if deleteTab was also run
      const addTabReply = resData.replies[resData.replies.length - 1].addDocumentTab;
      const newTabId = addTabReply.tabProperties.tabId;
      
      const serializedLines = remainingProposals.map(function(p) {
        return p.id + '|' + p.type + '|' + p.label + '|' + (p.old_value || '') + '|' + p.new_value + '|' + (p.insert_after_label || '') + '|' + p.reason;
      });
      const textContent = serializedLines.join('\n') + '\n';
      
      const insertReq = {
        requests: [{
          insertText: {
            endOfSegmentLocation: {
              tabId: newTabId,
              segmentId: ''
            },
            text: textContent
          }
        }]
      };
      
      UrlFetchApp.fetch(updateUrl, {
        method: 'post',
        contentType: 'application/json',
        headers: {
          Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
        },
        payload: JSON.stringify(insertReq)
      });
    }
  }
}

/**
 * Escapes special regex characters.
 */
function escapeRegex(string) {
  return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}




