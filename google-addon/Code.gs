/**
 * LPE Authoring Add-on
 * Main entry point and menu handlers
 */

/**
 * Creates a menu entry in Google Docs when the document opens.
 */
function onOpen(e) {
  DocumentApp.getUi()
      .createAddonMenu()
      .addItem('Open LPE Authoring Sidebar', 'showSidebar')
      .addItem('Sync Client Registry to LPE', 'menuSyncRegistry')
      .addToUi();
}

/**
 * Runs when the add-on is installed.
 */
function onInstall(e) {
  onOpen(e);
}

/**
 * Opens the LPE Authoring sidebar.
 */
function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
      .setTitle('LPE Page Authoring')
      .setWidth(350);
  DocumentApp.getUi().showSidebar(html);
}

/**
 * Saves LPE API configuration to Document Properties.
 * @param {Object} config - Configuration object with apiUrl and environment
 * @return {boolean} Success status
 */
function saveLPEConfig(config) {
  try {
    const documentProperties = PropertiesService.getDocumentProperties();
    documentProperties.setProperty('LPE_API_BASE_URL', config.apiUrl);
    documentProperties.setProperty('LPE_ENVIRONMENT', config.environment);
    if (config.apiKey) {
      documentProperties.setProperty('LPE_API_KEY', config.apiKey);
    } else {
      documentProperties.deleteProperty('LPE_API_KEY');
    }
    return true;
  } catch (error) {
    console.error('Error saving config:', error);
    return false;
  }
}

/**
 * Gets LPE API configuration from Document Properties.
 * @return {Object} Configuration object or null if not set
 */
function getLPEConfig() {
  try {
    const documentProperties = PropertiesService.getDocumentProperties();
    const apiUrl = documentProperties.getProperty('LPE_API_BASE_URL');
    const environment = documentProperties.getProperty('LPE_ENVIRONMENT');
    const apiKey = documentProperties.getProperty('LPE_API_KEY');
    
    if (!apiUrl) {
      return null;
    }
    
    return {
      apiUrl: apiUrl,
      environment: environment || 'dev',
      apiKey: apiKey || ''
    };
  } catch (error) {
    console.error('Error getting config:', error);
    return null;
  }
}

/**
 * Generates an AI draft page via the LPE backend API.
 * For MVP, uses mock response if USE_MOCK_BACKEND is true.
 * @param {Object} authoringRequest - The authoring request payload
 * @return {Object} Response with preview URL or error
 */
function generateDraftPage(authoringRequest) {
  const USE_MOCK_BACKEND = false; // Mock disabled for production readiness
  
  if (USE_MOCK_BACKEND) {
    return generateMockDraftResponse(authoringRequest);
  }
  
  try {
    const config = getLPEConfig();
    if (!config) {
      return {
        success: false,
        error: 'LPE API not configured. Please configure connection first.'
      };
    }
    
    const url = config.apiUrl + '/api/authoring/preview';
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'X-Api-Key': config.apiKey || ''
      },
      payload: JSON.stringify(authoringRequest),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = JSON.parse(response.getContentText());
    
    if (responseCode === 200) {
      const data = responseBody.data || responseBody;
      if (data && data.previewUrl && data.previewUrl.indexOf('localhost:3000') !== -1) {
        let baseDomain = config.apiUrl.replace(/\/api\/?$/, ''); // Strip /api suffix
        if (baseDomain.indexOf('cloudfunctions.net') !== -1 || baseDomain.indexOf('run.app') !== -1) {
          baseDomain = 'https://cloud-genai.com';
        }
        data.previewUrl = data.previewUrl.replace('http://localhost:3000', baseDomain);
      }
      return {
        success: true,
        data: data
      };
    } else {
      return {
        success: false,
        error: responseBody.error || 'Backend error',
        statusCode: responseCode
      };
    }
  } catch (error) {
    console.error('Error generating draft:', error);
    return {
      success: false,
      error: 'Network error: ' + error.message
    };
  }
}

/**
 * Generates a mock draft response for testing without backend.
 * @param {Object} authoringRequest - The authoring request payload
 * @return {Object} Mock response
 */
function generateMockDraftResponse(authoringRequest) {
  // Simulate network delay
  Utilities.sleep(1500);
  
  const pageId = authoringRequest.pageId;
  const config = getLPEConfig();
  const baseUrl = config ? config.apiUrl.replace('/api', '') : 'http://localhost:3000';
  
  return {
    success: true,
    data: {
      pageId: pageId,
      status: 'draft',
      previewUrl: baseUrl + '/preview/' + pageId,
      validation: {
        ok: true,
        errors: []
      },
      generatedAt: new Date().toISOString(),
      _mockMode: true
    }
  };
}

/**
 * Exposes the workspace provisioning service to the client sidebar.
 * @param {string} clientName - The client name
 * @return {Object} The provisioned workspace result
 */
function apiProvisionClient(clientName, firstName, lastName, emails, domains) {
  return provisionClientWorkspace(clientName, firstName, lastName, emails, domains);
}

/**
 * Exposes calendar event retrieval to the sidebar.
 */
function apiGetRecentMeetings() {
  return getRecentMeetings();
}

/**
 * Exposes meeting mapping to the sidebar.
 */
function apiLinkMeetingToClient(meetId, clientId, meetTitle, meetTime) {
  return linkMeetingToClient(meetId, clientId, meetTitle, meetTime);
}

/**
 * Exposes meeting scheduling and client linkage to the sidebar.
 */
function apiScheduleAndLinkMeeting(clientId, title, timeStr, guestEmail, description) {
  return scheduleAndLinkMeeting(clientId, title, timeStr, guestEmail, description);
}

/**
 * Exposes client registry listings to the sidebar.
 */
function apiGetClientList() {
  return getClientListFromRegistry();
}

/**
 * Handles the menu click event to sync the Google Sheet registry with LPE.
 */
function menuSyncRegistry() {
  const ui = DocumentApp.getUi();
  ui.showModelessDialog(
    HtmlService.createHtmlOutput("<p style='font-family:sans-serif;'>Synchronizing registry documents with Cloud Firestore...</p>").setWidth(250).setHeight(80), 
    "LPE Syncing"
  );
  
  const response = syncEntireRegistryToLPE();
  
  if (response.success) {
    ui.alert("Sync Successful", "Successfully synced " + response.count + " clients to LPE Firestore database.", ui.ButtonSet.OK);
  } else {
    ui.alert("Sync Failed", "Sync failed: " + response.error, ui.ButtonSet.OK);
  }
}

/**
 * Exposes the active document onboarding and page compilation trigger to the sidebar.
 */
function apiOnboardAndCompileActiveDoc() {
  return onboardAndCompileActiveDoc();
}

/**
 * Exposes active document client auto-detection to the sidebar.
 */
function apiGetDocumentClient() {
  return getDocumentClient();
}

/**
 * Publishes a generated preview page to the LPE Showcase Feed.
 * @param {string} pageId - The page ID/slug
 * @param {string} requestId - The request ID (for doc compilation)
 * @param {string} clientId - The target client ID
 * @param {string} tag - The select tag (e.g. sandbox, saas, legal...)
 * @return {Object} Response status
 */
function apiPublishToShowcase(pageId, requestId, clientId, tag) {
  try {
    const config = getLPEConfig();
    if (!config) {
      return {
        success: false,
        error: 'LPE API not configured. Please configure connection first.'
      };
    }
    
    const url = config.apiUrl + '/api/authoring/publish-showcase';
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'X-Api-Key': config.apiKey || ''
      },
      payload: JSON.stringify({
        pageId: pageId,
        requestId: requestId,
        clientId: clientId,
        tag: tag
      }),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = JSON.parse(response.getContentText());
    
    if (responseCode === 200) {
      return {
        success: true,
        data: responseBody
      };
    } else {
      return {
        success: false,
        error: responseBody.error || 'Backend error',
        statusCode: responseCode
      };
    }
  } catch (error) {
    console.error('Error publishing to showcase:', error);
    return {
      success: false,
      error: 'Network error: ' + error.message
    };
  }
}

/**
 * Exposes active document onboarding status to the sidebar.
 */
function apiGetActiveDocOnboardingStatus(overrideClientId) {
  return getActiveDocOnboardingStatus(overrideClientId);
}

/**
 * Exposes the client media assets sync function to the sidebar.
 * @param {string} clientId - The client ID
 * @return {Object} Response status and data
 */
function apiSyncClientMedia(clientId) {
  try {
    const config = getLPEConfig();
    if (!config) {
      return {
        success: false,
        error: 'LPE API not configured. Please configure connection first.'
      };
    }
    
    const url = config.apiUrl + '/api/adl/clients/' + clientId + '/sync-media';
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'X-Api-Key': config.apiKey || ''
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = JSON.parse(response.getContentText());
    
    if (responseCode === 200) {
      return {
        success: true,
        message: responseBody.message || 'Media assets synced successfully!',
        media_assets: responseBody.media_assets || []
      };
    } else {
      return {
        success: false,
        error: responseBody.error || 'Backend error during media sync',
        statusCode: responseCode
      };
    }
  } catch (error) {
    console.error('Error syncing client media:', error);
    return {
      success: false,
      error: 'Network error during media sync: ' + error.message
    };
  }
}

/**
 * Exposes proposal retrieval to the sidebar.
 */
function apiGetProposals() {
  return getProposalsFromDoc();
}

/**
 * Exposes proposal approval to the sidebar.
 */
function apiApproveProposal(proposalId) {
  return applyDocProposal(proposalId);
}

/**
 * Exposes proposal ignore/deletion to the sidebar.
 */
function apiIgnoreProposal(proposalId) {
  return ignoreDocProposal(proposalId);
}

/**
 * Exposes scenario seeding to the sidebar.
 */
function apiSeedLpeScenarios() {
  try {
    const SERVICE_ACCOUNTS = [
      "<YOUR_SERVICE_ACCOUNT_EMAIL>",
      "workspace-agent-sa@lpe-agent-sandbox-vd96n.iam.gserviceaccount.com"
    ];

    const SCENARIOS = {
      "Scenario 1: Apex Cyber Security": {
        "brief_title": "Apex Cyber Security - Campaign Briefing",
        "brief_content": "Apex Cyber Security - Campaign Briefing\nThis document contains the brand guidelines, copywriting directives, and key features for the campaign.\n\n1. Brand Guidelines\nTheme Mode (Dark / Light / Glassmorphism): Dark\nPrimary Accent Color (HEX): #0F172A\nSecondary Accent Color (HEX): #64748B\nHeading Font Family (Inter / Outfit / Roboto / Sora): Inter\n\n2. Hero Banner\nCore Headline Promise: Secure Your Enterprise in the Cloud\nSubheadline: Deploy autonomous security agents to actively monitor and guard your cloud infrastructure.\nCTA Action Label: Schedule Free Audit\nCTA Link URL: https://apexcyber.io/audit\n\n3. Product Features\nFeature 1 Title: Zero Trust Architecture\nFeature 1 Description: Never trust, always verify. Every request is fully authenticated, authorized, and encrypted.\nFeature 2 Title: Active Threat Scanning\nFeature 2 Description: Real-time network and system scans that catch intrusions before they affect operations.\n\n4. Customer Reviews\nReview 1 Name: Johnathan Crane\nReview 1 Rating (1-5): 5\nReview 1 Source (google / yelp / facebook / custom): google\nReview 1 Quote: Apex gave us complete visibility into our compliance gaps. Highly recommended.\n",
        "meet_title": "Apex Cyber Security Kickoff Meeting [2026-06-05 10:00]",
        "summary_content": "Meeting Name: Apex Cyber Security Kickoff Meeting\nDate: 2026-06-05\nAttendees: Agent Operator (LPE), Team Lead (LPE), Sarah Vance (Apex Cyber Security)\n\nSummary:\nThe team discussed launching the campaign landing page. Sarah requested some updates to their visual identity: shifting the theme from Dark mode to Glassmorphism, using a high-contrast electric blue (#2563EB) as the accent color, changing the primary CTA label to \"Request Demo\", and adding a new \"Automated Compliance\" product feature focusing on SOC2/ISO readiness.",
        "transcript_content": "[00:00:00] Agent Operator: Welcome, Sarah. Let's review the initial briefing document we drafted.\n[00:00:15] Sarah Vance: Thanks, William. I looked at the draft. The brand guidelines say Dark mode, but we want the page to look like a modern dashboard. Let's use Glassmorphism instead of standard Dark mode.\n[00:00:45] Team Lead: Got it, Glassmorphism. What about the accent colors?\n[00:01:02] Sarah Vance: The primary color #0F172A is too dark and muted for the main buttons. Let's switch the primary accent color to a high-contrast electric blue: #2563EB.\n[00:01:30] Agent Operator: Okay, noted. Electric blue #2563EB. What about the call to action?\n[00:01:45] Sarah Vance: Change the CTA button to say \"Request Demo\" instead of \"Schedule Free Audit\". It fits our sales funnel better.\n[00:02:10] Team Lead: Perfect. I'll make that change. Any updates to product features?\n[00:02:25] Sarah Vance: Yes, under product features, let's add a new section called \"Automated Compliance\" that details SOC2 and ISO27001 readiness. That is a huge selling point for our enterprise clients.\n[00:03:00] Agent Operator: Excellent. We will get these aligned and updated."
      },
      "Scenario 2: Spark Fitness Co": {
        "brief_title": "Spark Fitness Co - Campaign Briefing",
        "brief_content": "Spark Fitness Co - Campaign Briefing\nThis document contains the brand guidelines, copywriting directives, and key features for the campaign.\n\n1. Brand Guidelines\nTheme Mode (Dark / Light / Glassmorphism): Light\nPrimary Accent Color (HEX): #EF4444\nSecondary Accent Color (HEX): #10B981\nHeading Font Family (Inter / Outfit / Roboto / Sora): Sora\n\n2. Hero Banner\nCore Headline Promise: Unleash Your Potential\nSubheadline: Connect with expert personal trainers and reach your fitness targets.\nCTA Action Label: Join Now\nCTA Link URL: https://sparkfitness.co/signup\n\n3. Product Features\nFeature 1 Title: Tailored Workouts\nFeature 1 Description: 100% personalized workout plans designed for your body type and fitness goals.\nFeature 2 Title: Nutrition Coaching\nFeature 2 Description: Certified nutritionists building meal plans that complement your active lifestyle.\nFeature 3 Title: Group Classes\nFeature 3 Description: Access high-intensity group classes daily.\n\n4. Customer Reviews\nReview 1 Name: Alex Mercer\nReview 1 Rating (1-5): 5\nReview 1 Source (google / yelp / facebook / custom): custom\nReview 1 Quote: The trainers at Spark completely transformed my fitness routine!\n",
        "meet_title": "Spark Fitness Co Alignment Sync [2026-06-05 11:00]",
        "summary_content": "Meeting Name: Spark Fitness Co Alignment Sync\nDate: 2026-06-05\nAttendees: Agent Operator (LPE), Team Lead (LPE), Coach Dave (Spark Fitness Co)\n\nSummary:\nCoach Dave requested styling and copy updates for the landing page. Key updates include switching the layout to Dark mode, changing the primary accent color to high-energy orange (#F97316), revising the headline to 'Start Your Fitness Journey Today', and completely removing Feature 3 ('Group Classes') because the company is focusing exclusively on 1-on-1 personal training.",
        "transcript_content": "[00:00:00] Team Lead: Hi Dave, let's look at the Spark Fitness brief.\n[00:00:20] Coach Dave: Hey team. First off, most fitness enthusiasts prefer dark backgrounds when viewing trainers. Let's make the theme Dark instead of Light.\n[00:00:50] Agent Operator: Got it. Dark mode theme. What about the primary red #EF4444?\n[00:01:10] Coach Dave: The red color #EF4444 is too aggressive. Let's change the accent to a high-energy orange: #F97316. It feels much warmer and positive.\n[00:01:40] Team Lead: Orange #F97316, noted. How does the headline look?\n[00:01:55] Coach Dave: Let's use a more action-oriented headline: \"Start Your Fitness Journey Today\".\n[00:02:15] Agent Operator: Excellent. And product features?\n[00:02:30] Coach Dave: Oh, one major business change: we need to remove Feature 3 \"Group Classes\" entirely because we are moving 100% to 1-on-1 personal training sessions. We aren't offering group classes anymore.\n[00:03:00] Team Lead: Got it, we will delete the Group Classes section from the brief and live page."
      },
      "Scenario 3: Lumina Home Decor": {
        "brief_title": "Lumina Home Decor - Campaign Briefing",
        "brief_content": "Lumina Home Decor - Campaign Briefing\nThis document contains the brand guidelines, copywriting directives, and key features for the campaign.\n\n1. Brand Guidelines\nTheme Mode (Dark / Light / Glassmorphism): Glassmorphism\nPrimary Accent Color (HEX): #D97706\nSecondary Accent Color (HEX): #78350F\nHeading Font Family (Inter / Outfit / Roboto / Sora): Outfit\n\n2. Hero Banner\nCore Headline Promise: Elevate Your Living Space\nSubheadline: Premium artisan furniture and decorations hand-crafted for your home.\nCTA Action Label: Explore Collection\nCTA Link URL: https://luminadecor.com/shop\n\n3. Product Features\nFeature 1 Title: Handcrafted Quality\nFeature 1 Description: Every single item is uniquely crafted by local master artisans using sustainable materials.\nFeature 2 Title: Custom Sizing\nFeature 2 Description: Order tailor-made sizes to fit the exact proportions of your rooms.\n\n4. Customer Reviews\nReview 1 Name: Clara Oswald\nReview 1 Rating (1-5): 5\nReview 1 Source (google / yelp / facebook / custom): custom\nReview 1 Quote: Lumina's dining table has become the absolute centerpiece of our home.\n",
        "meet_title": "Lumina Home Decor Launch Prep [2026-06-05 13:00]",
        "summary_content": "Meeting Name: Lumina Home Decor Launch Prep\nDate: 2026-06-05\nAttendees: Agent Operator (LPE), Team Lead (LPE), Sophia Reed (Lumina Home Decor)\n\nSummary:\nSophia from Lumina reviewed the landing page brief. She requested changing the theme mode to Light mode for better text readability, replacing the amber accent color (#D97706) with an organic sage green (#10B981), changing the CTA label to 'Shop Best Sellers', and adding a customer review from 'Marcus Aurelius' praising their durable craftsmanship.",
        "transcript_content": "[00:00:00] Agent Operator: Hello Sophia, let's review the Lumina Decor campaign brief.\n[00:00:18] Sophia Reed: Hi William. The layout looks very creative, but Glassmorphism makes the copy a bit hard to read on home decor sites. Let's change the theme mode to Light mode.\n[00:00:48] Team Lead: Got it. Switching to Light mode. What about colors?\n[00:01:05] Sophia Reed: The amber color #D97706 feels too orange for our current summer collection. Let's go with a organic sage green: #10B981.\n[00:01:35] Agent Operator: Organic Sage Green #10B981, got it. How about the buttons?\n[00:01:50] Sophia Reed: Let's update the CTA label to say \"Shop Best Sellers\" instead of \"Explore Collection\".\n[00:02:10] Team Lead: Perfect. And reviews?\n[00:02:22] Sophia Reed: Let's add a customer review from \"Marcus Aurelius\" with 5 stars and review quote \"Beautiful and durable craftsmanship\". It represents our quality perfectly.\n[00:02:50] Agent Operator: Got it. We will add Marcus's review and apply the style modifications."
      }
    };

    // Find parent folder "LPE Client Onboarding"
    const rootFolderName = 'LPE Client Onboarding';
    const rootFolders = DriveApp.getFoldersByName(rootFolderName);
    let parentFolder = null;
    
    if (rootFolders.hasNext()) {
      parentFolder = rootFolders.next();
    } else {
      parentFolder = DriveApp.createFolder(rootFolderName);
    }

    // Create LPE Test Scenarios inside LPE Client Onboarding
    let testFolder = null;
    const existingTestFolders = parentFolder.getFoldersByName("LPE Test Scenarios");
    if (existingTestFolders.hasNext()) {
      testFolder = existingTestFolders.next();
    } else {
      testFolder = parentFolder.createFolder("LPE Test Scenarios");
    }

    for (const scName in SCENARIOS) {
      const data = SCENARIOS[scName];
      const clientFolders = testFolder.getFoldersByName(scName);
      let clientFolder = null;
      if (clientFolders.hasNext()) {
        clientFolder = clientFolders.next();
      } else {
        clientFolder = testFolder.createFolder(scName);
      }

      // Create Brief Doc
      const briefDoc = DocumentApp.create(data.brief_title);
      briefDoc.getBody().setText(data.brief_content);
      briefDoc.saveAndClose();
      const briefFile = DriveApp.getFileById(briefDoc.getId());
      clientFolder.addFile(briefFile);
      DriveApp.getRootFolder().removeFile(briefFile);

      // Create Meet Doc
      const meetDoc = DocumentApp.create(data.meet_title);
      const docId = meetDoc.getId();
      meetDoc.saveAndClose();
      const meetFile = DriveApp.getFileById(docId);
      clientFolder.addFile(meetFile);
      DriveApp.getRootFolder().removeFile(meetFile);

      // Advanced API: setup tabs
      const docResource = Docs.Documents.get(docId, { includeTabsContent: true });
      const defaultTabId = docResource.tabs[0].tabProperties.tabId;

      const requests = [
        {
          addDocumentTab: {
            tabProperties: {
              title: "Transcript"
            }
          }
        }
      ];

      const res = Docs.Documents.batchUpdate({ requests: requests }, docId);
      const transcriptTabId = res.replies[0].addDocumentTab.tabProperties.tabId;

      const writeRequests = [
        {
          insertText: {
            endOfSegmentLocation: {
              tabId: defaultTabId,
              segmentId: ""
            },
            text: data.summary_content
          }
        },
        {
          insertText: {
            endOfSegmentLocation: {
              tabId: transcriptTabId,
              segmentId: ""
            },
            text: data.transcript_content
          }
        }
      ];
      Docs.Documents.batchUpdate({ requests: writeRequests }, docId);

      // Share files with Service Accounts
      SERVICE_ACCOUNTS.forEach(function(sa) {
        try {
          briefFile.addEditor(sa);
          meetFile.addEditor(sa);
        } catch (e) {
          console.warn("Could not share file with " + sa + ": " + e.message);
        }
      });

      // Register the client and meeting on the LPE backend Firestore database
      const clientMetaMap = {
        "Scenario 1: Apex Cyber Security": {
          "id": "apex-cyber-security",
          "name": "Apex Cyber Security",
          "emails": ["sarah@apexcyber.io"],
          "domains": ["apexcyber.io"],
          "meet_id": "apex-cyber-meet-id",
          "meet_title": data.meet_title,
          "start_time": "2026-06-05T10:00:00Z"
        },
        "Scenario 2: Spark Fitness Co": {
          "id": "spark-fitness-co",
          "name": "Spark Fitness Co",
          "emails": ["dave@sparkfitness.co"],
          "domains": ["sparkfitness.co"],
          "meet_id": "spark-fitness-meet-id",
          "meet_title": data.meet_title,
          "start_time": "2026-06-05T11:00:00Z"
        },
        "Scenario 3: Lumina Home Decor": {
          "id": "lumina-home-decor",
          "name": "Lumina Home Decor",
          "emails": ["sophia@luminadecor.com"],
          "domains": ["luminadecor.com"],
          "meet_id": "lumina-decor-meet-id",
          "meet_title": data.meet_title,
          "start_time": "2026-06-05T13:00:00Z"
        }
      };

      const meta = clientMetaMap[scName];
      const config = getLPEConfig();
      if (config && config.apiUrl && meta) {
        try {
          // 1. Sync Client Registry
          const registryUrl = config.apiUrl + "/api/adl/sync-registry";
          const registryPayload = {
            "clients": [
              {
                "id": meta.id,
                "name": meta.name,
                "emails": meta.emails,
                "domains": meta.domains,
                "drive_folder_id": clientFolder.getId(),
                "transcripts_folder_id": clientFolder.getId()
              }
            ]
          };
          UrlFetchApp.fetch(registryUrl, {
            method: "post",
            contentType: "application/json",
            headers: {
              "X-Api-Key": config.apiKey || ""
            },
            payload: JSON.stringify(registryPayload),
            muteHttpExceptions: true
          });

          // 2. Sync Scheduled Meeting
          const meetingUrl = config.apiUrl + "/api/adl/sync-meeting";
          const meetingPayload = {
            "meet_id": meta.meet_id,
            "client_id": meta.id,
            "title": meta.meet_title,
            "start_time": meta.start_time
          };
          UrlFetchApp.fetch(meetingUrl, {
            method: "post",
            contentType: "application/json",
            headers: {
              "X-Api-Key": config.apiKey || ""
            },
            payload: JSON.stringify(meetingPayload),
            muteHttpExceptions: true
          });
        } catch (apiErr) {
          console.warn("Failed to sync metadata to LPE backend: " + apiErr.message);
        }
      }
    }

    return { success: true };
  } catch (error) {
    console.error("Scenario seeding failed:", error);
    return { success: false, error: error.message };
  }
}
