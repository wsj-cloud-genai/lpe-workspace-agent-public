import os
import sys
import logging
import re
from google.oauth2 import service_account

log = logging.getLogger(__name__)
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload
import io

# Resolve relative path to the service account key in the API folder
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
LPE_ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "../../../.."))
KEY_PATH = os.path.join(LPE_ROOT_DIR, "api", "service-account-key.json")
if not os.path.exists(KEY_PATH):
    KEY_PATH = os.path.join(LPE_ROOT_DIR, "service-account-key.json")

def get_service_account_creds():
    """Loads Google service account credentials dynamically with local fallbacks."""
    # 1. Check if defined in environment variables
    env_key = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    target_path = env_key if env_key and os.path.exists(env_key) else KEY_PATH
    
    # 2. Check if a local key copy exists in the workspace root (parent of src)
    if not os.path.exists(target_path):
        workspace_fallback = os.path.join(CURRENT_DIR, "..", "service-account-key.json")
        if os.path.exists(workspace_fallback):
            target_path = workspace_fallback
            
    # 3. Check if a local key copy exists in the same folder as this script (src)
    if not os.path.exists(target_path):
        local_fallback = os.path.join(CURRENT_DIR, "service-account-key.json")
        if os.path.exists(local_fallback):
            target_path = local_fallback
            
    scopes = [
        'https://www.googleapis.com/auth/documents.readonly',
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets'
    ]

    # 4. Fall back to Application Default Credentials (ADC) for Cloud Run
    if not os.path.exists(target_path):
        try:
            import google.auth
            creds, project = google.auth.default(scopes=scopes)
            log.info("Loaded credentials via Google Application Default Credentials (ADC)")
            return creds
        except Exception as e:
            raise FileNotFoundError(
                f"Google Cloud credentials not resolved (including ADC fallback failure: {e}).\n"
                f"Please ensure your service account key is available in one of the following locations:\n"
                f"  - App Monorepo Path: {KEY_PATH}\n"
                f"  - Workspace Root Path: {os.path.join(CURRENT_DIR, '..', 'service-account-key.json')}\n"
                f"  - Isolated Hackathon Path: {os.path.join(CURRENT_DIR, 'service-account-key.json')}\n"
                f"  - Env Variable Path: via GOOGLE_APPLICATION_CREDENTIALS"
            )
            
    return service_account.Credentials.from_service_account_file(target_path, scopes=scopes)

def fetch_google_doc(doc_id, docs_service=None):
    """
    Fetches the raw text content of a Google Document by ID.
    """
    if docs_service is None:
        creds = get_service_account_creds()
        docs_service = build('docs', 'v1', credentials=creds)
    try:
        doc = docs_service.documents().get(documentId=doc_id).execute()
        
        # Read the body text recursively, including People Chips and Hyperlink Metadata
        text = ""
        body_content = doc.get('body', {}).get('content', [])
        for element in body_content:
            if 'paragraph' in element:
                for run in element.get('paragraph', {}).get('elements', []):
                    if 'textRun' in run:
                        run_text = run.get('textRun', {}).get('content', '')
                        text_style = run.get('textRun', {}).get('textStyle', {})
                        # Extract email from hyperlink (e.g. mailto:email@domain.com) if present
                        if 'link' in text_style and 'url' in text_style['link']:
                            url = text_style['link']['url']
                            if url.startswith('mailto:'):
                                email = url[7:]
                                run_text += f" <{email}>"
                        text += run_text
                    elif 'person' in run:
                        # Extract email address directly from Google Doc People Chips (person elements)
                        person = run.get('person')
                        name = person.get('personProperties', {}).get('name', '')
                        email = person.get('personProperties', {}).get('email', '')
                        if email:
                            text += f" {name} <{email}>"
                        else:
                            text += f" {name}"
        return text
    except HttpError as err:
        if err.resp.status == 403:
            raise PermissionError(f"Access Denied (403). Ensure the Google Doc is shared with: {creds.service_account_email}")
        raise err

def fetch_drive_file_text(file_id):
    """
    Downloads and extracts raw text from a Google Drive file by ID.
    If the file is a Google Doc, it parses it using fetch_google_doc.
    Otherwise, it downloads the file content as plain text.
    """
    creds = get_service_account_creds()
    try:
        drive_service = build('drive', 'v3', credentials=creds)
        
        # Fetch metadata to determine mimeType
        file_meta = drive_service.files().get(fileId=file_id, fields="name, mimeType").execute()
        mime_type = file_meta.get('mimeType', '')
        
        # If it is a Google Doc, use fetch_google_doc
        if mime_type == 'application/vnd.google-apps.document':
            return fetch_google_doc(file_id)
            
        # If it is a plain text file, download the media directly
        request = drive_service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        
        fh.seek(0)
        return fh.read().decode('utf-8', errors='ignore')
    except HttpError as err:
        if err.resp.status == 403:
            raise PermissionError(f"Access Denied (403). Ensure the Drive file is shared with: {creds.service_account_email}")
        raise err

def get_latest_file_in_folder(folder_id):
    """
    Lists files inside a Google Drive folder and returns the file ID and name
    of the most recently created file. Returns (None, None) if folder is empty.
    """
    creds = get_service_account_creds()
    try:
        drive_service = build('drive', 'v3', credentials=creds)
        
        # Query files inside the folder, sorted by createdTime descending
        query = f"'{folder_id}' in parents and trashed = false"
        results = drive_service.files().list(
            q=query,
            orderBy="createdTime desc",
            pageSize=1,
            fields="files(id, name)"
        ).execute()
        
        files = results.get('files', [])
        if files:
            return files[0]['id'], files[0]['name']
        return None, None
    except HttpError as err:
        if err.resp.status == 403:
            raise PermissionError(f"Access Denied (403). Ensure the folder is shared with: {creds.service_account_email}")
        raise err

def list_files_in_folder(folder_id):
    """
    Lists all files inside a Google Drive folder.
    Returns a list of dicts: [ { "id": str, "name": str, "createdTime": str, "mimeType": str } ]
    """
    creds = get_service_account_creds()
    try:
        drive_service = build('drive', 'v3', credentials=creds)
        query = f"'{folder_id}' in parents and trashed = false"
        results = drive_service.files().list(
            q=query,
            orderBy="createdTime desc",
            pageSize=50,
            fields="files(id, name, createdTime, mimeType)"
        ).execute()
        return results.get('files', [])
    except HttpError as err:
        if err.resp.status == 403:
            raise PermissionError(f"Access Denied (403). Ensure the folder is shared with: {creds.service_account_email}")
        raise err

def find_google_doc_in_folder(folder_id):
    """
    Finds the first Google Doc file in a Google Drive folder.
    Returns the file ID, or None if not found.
    """
    creds = get_service_account_creds()
    try:
        drive_service = build('drive', 'v3', credentials=creds)
        query = f"'{folder_id}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false"
        results = drive_service.files().list(
            q=query,
            pageSize=1,
            fields="files(id, name)"
        ).execute()
        files = results.get('files', [])
        if files:
            return files[0]['id']
        return None
    except Exception as e:
        log.warning(f"Failed to find Google Doc in folder {folder_id}: {e}")
        return None

def download_drive_file_binary(file_id):
    """
    Downloads raw binary content of a Google Drive file by ID.
    Returns: bytes
    """
    creds = get_service_account_creds()
    try:
        drive_service = build('drive', 'v3', credentials=creds)
        request = drive_service.files().get_media(fileId=file_id)
        fh = io.BytesIO()
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while done is False:
            status, done = downloader.next_chunk()
        return fh.getvalue()
    except HttpError as err:
        if err.resp.status == 403:
            raise PermissionError(f"Access Denied (403). Ensure file is shared with: {creds.service_account_email}")
        raise err

def update_client_registry_spreadsheet(client_id, meet_id=None, transcript_file_id=None):
    """
    Finds the 'LPE Client Registry' spreadsheet in Google Drive and updates
    the 'Linked Meeting ID' and/or 'Linked Transcript File ID' for the target client.
    """
    creds = get_service_account_creds()
    try:
        drive_service = build('drive', 'v3', credentials=creds)
        sheets_service = build('sheets', 'v4', credentials=creds)
        
        # 1. Search for the 'LPE Client Registry' spreadsheet
        query = "name = 'LPE Client Registry' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
        results = drive_service.files().list(q=query, pageSize=1, fields="files(id)").execute()
        files = results.get('files', [])
        if not files:
            log.warning("Spreadsheet 'LPE Client Registry' not found in Drive.")
            return False
            
        spreadsheet_id = files[0]['id']
        
        # 2. Get the values of the first sheet to locate the client row and column indices
        res = sheets_service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range="A:K"
        ).execute()
        
        rows = res.get('values', [])
        if not rows:
            log.warning("No data found in the spreadsheet.")
            return False
            
        headers = rows[0]
        
        # Find column indices
        meet_col_idx = -1
        trans_col_idx = -1
        client_col_idx = -1
        
        for idx, h in enumerate(headers):
            h_clean = h.strip().lower()
            if h_clean == "client id" and client_col_idx == -1:
                client_col_idx = idx
            elif h_clean == "linked meeting id" and meet_col_idx == -1:
                meet_col_idx = idx
            elif h_clean == "linked transcript file id" and trans_col_idx == -1:
                trans_col_idx = idx
                
        # Fallback if columns don't exist yet
        if meet_col_idx == -1:
            meet_col_idx = 9
        if trans_col_idx == -1:
            trans_col_idx = 10
        if client_col_idx == -1:
            client_col_idx = 0
            
        # Find the row for the client
        row_num = -1
        for idx, row in enumerate(rows[1:], start=2): # 1-indexed, starts after header
            if len(row) > client_col_idx and row[client_col_idx] == client_id:
                row_num = idx
                break
                
        if row_num == -1:
            log.warning(f"Client ID '{client_id}' not found in registry sheet.")
            return False
            
        # Helper to convert index to letter (up to columns like Z, AA)
        def col_idx_to_letter(idx):
            temp = ""
            while idx >= 0:
                temp = chr(idx % 26 + 65) + temp
                idx = idx // 26 - 1
            return temp

        # 3. Update the cell values
        updates = []
        if meet_id is not None:
            col_letter = col_idx_to_letter(meet_col_idx)
            updates.append({
                "range": f"{col_letter}{row_num}",
                "values": [[meet_id]]
            })
        if transcript_file_id is not None:
            col_letter = col_idx_to_letter(trans_col_idx)
            updates.append({
                "range": f"{col_letter}{row_num}",
                "values": [[transcript_file_id]]
            })
            
        if updates:
            body = {
                "valueInputOption": "USER_ENTERED",
                "data": updates
            }
            sheets_service.spreadsheets().values().batchUpdate(
                spreadsheetId=spreadsheet_id,
                body=body
            ).execute()
            log.info(f"Successfully updated spreadsheet registry for client '{client_id}': meet={meet_id}, transcript={transcript_file_id}")
            return True
            
        return False
    except Exception as e:
        log.exception(f"Failed to update spreadsheet registry for client '{client_id}': {e}")
        return False

def fetch_transcript_tab_text(doc_id: str, tab_name: str = "Transcript", docs_service=None) -> str:
    """
    Fetches the raw text content of a specific tab from a Google Document by ID.
    """
    if docs_service is None:
        creds = get_service_account_creds()
        docs_service = build('docs', 'v1', credentials=creds)
    doc = docs_service.documents().get(documentId=doc_id, includeTabsContent=True).execute()
    
    log.info(f"Fetched transcript document keys: {list(doc.keys())}")
    
    def find_tab_by_title(tabs, title):
        for tab in tabs:
            tab_title = tab.get('tabProperties', {}).get('title', '').strip()
            log.info(f"Checking tab title: '{tab_title}' (ID: {tab.get('tabProperties', {}).get('tabId')})")
            if tab_title.lower() == title.lower():
                return tab
            if 'childTabs' in tab:
                found = find_tab_by_title(tab['childTabs'], title)
                if found:
                    return found
        return None

    tabs = doc.get('tabs')
    body_content = []
    if tabs:
        log.info(f"Detected {len(tabs)} top-level tabs in transcript doc.")
        target_tab = find_tab_by_title(tabs, tab_name)
        if target_tab:
            log.info(f"Successfully matched '{tab_name}' tab!")
            body_content = target_tab.get('documentTab', {}).get('body', {}).get('content', [])
        else:
            log.warning(f"Could not find '{tab_name}' tab. Defaulting to first tab.")
            body_content = tabs[0].get('documentTab', {}).get('body', {}).get('content', [])
    else:
        log.warning("No 'tabs' field found in document response. Defaulting to main body.")
        body_content = doc.get('body', {}).get('content', [])
        
    text = ""
    for element in body_content:
        if 'paragraph' in element:
            for run in element.get('paragraph', {}).get('elements', []):
                if 'textRun' in run:
                    text += run.get('textRun', {}).get('content', '')
    return text

def clear_existing_proposals(docs_service, doc_id):
    """
    Scans the Google Doc and deletes any existing ' [PROP-x]' tags,
    and clears any yellow background color highlights.
    """
    log.info("Clearing existing highlights and markers from brief doc...")
    doc = docs_service.documents().get(documentId=doc_id, includeTabsContent=True).execute()
    
    body_content = []
    tabs = doc.get('tabs')
    brief_tab_id = ""
    if tabs:
        brief_tab = tabs[0]
        brief_tab_id = brief_tab['tabProperties']['tabId']
        body_content = brief_tab.get('documentTab', {}).get('body', {}).get('content', [])
    else:
        body_content = doc.get('body', {}).get('content', [])
        
    requests = []
    for element in reversed(body_content): # reverse order to keep indices stable
        if 'paragraph' not in element:
            continue
        p = element['paragraph']
        p_start = element.get('startIndex')
        
        p_text = "".join([run.get('textRun', {}).get('content', '') for run in p.get('elements', []) if 'textRun' in run])
        
        # Regex search for the PROP- or ADK- marker
        match = re.search(r' \[(PROP|ADK)-\d+\]', p_text)
        if match:
            marker_start = match.start()
            marker_len = len(match.group(0))
            
            req = {
                'deleteContentRange': {
                    'range': {
                        'startIndex': p_start + marker_start,
                        'endIndex': p_start + marker_start + marker_len
                    }
                }
            }
            if brief_tab_id:
                req['deleteContentRange']['range']['tabId'] = brief_tab_id
            requests.append(req)
            
        # Also clear any background highlights on this paragraph's text runs
        for run in p.get('elements', []):
            run_start = run.get('startIndex')
            run_end = run.get('endIndex')
            text_style = run.get('textRun', {}).get('textStyle', {})
            if 'backgroundColor' in text_style:
                req = {
                    'updateTextStyle': {
                        'range': {
                            'startIndex': run_start,
                            'endIndex': run_end
                        },
                        'textStyle': {
                            'backgroundColor': {} # Clears highlight
                        },
                        'fields': 'backgroundColor'
                    }
                }
                if brief_tab_id:
                    req['updateTextStyle']['range']['tabId'] = brief_tab_id
                requests.append(req)
                
    if requests:
        docs_service.documents().batchUpdate(documentId=doc_id, body={'requests': requests}).execute()

def apply_highlights_and_markers(docs_service, doc_id, proposals):
    """
    Searches for the labels of proposals in the Google Doc, highlights the old values in yellow,
    and appends [PROP-x] tags.
    """
    log.info("Applying yellow highlights and [PROP-x] markers in doc...")
    doc = docs_service.documents().get(documentId=doc_id, includeTabsContent=True).execute()
    
    body_content = []
    tabs = doc.get('tabs')
    brief_tab_id = ""
    if tabs:
        brief_tab = tabs[0]
        brief_tab_id = brief_tab['tabProperties']['tabId']
        body_content = brief_tab.get('documentTab', {}).get('body', {}).get('content', [])
    else:
        body_content = doc.get('body', {}).get('content', [])
        
    requests = []
    
    for element in reversed(body_content):
        if 'paragraph' not in element:
            continue
        p = element['paragraph']
        p_start = element.get('startIndex')
        p_text = "".join([run.get('textRun', {}).get('content', '') for run in p.get('elements', []) if 'textRun' in run])
        
        for prop in proposals:
            label = prop.get('label', '').strip()
            if not label or label not in p_text:
                continue
                
            prop_id = prop.get('id')
            
            # Find exact bounds of the value part
            label_idx = p_text.find(label)
            val_start = label_idx + len(label)
            
            val_end = len(p_text)
            if p_text.endswith('\n'):
                val_end -= 1
                
            # Append PROP-x text marker
            marker_text = f" [{prop_id}]"
            req_insert = {
                'insertText': {
                    'location': {
                        'index': p_start + val_end
                    },
                    'text': marker_text
                }
            }
            if brief_tab_id:
                req_insert['insertText']['location']['tabId'] = brief_tab_id
            requests.append(req_insert)
            
            # Highlight value range + marker in yellow
            req_highlight = {
                'updateTextStyle': {
                    'range': {
                        'startIndex': p_start + val_start,
                        'endIndex': p_start + val_end + len(marker_text)
                    },
                    'textStyle': {
                        'backgroundColor': {
                            'color': {
                                'rgbColor': {
                                    'red': 1.0,
                                    'green': 0.95,
                                    'blue': 0.8
                                }
                            }
                        }
                    },
                    'fields': 'backgroundColor'
                }
            }
            if brief_tab_id:
                req_highlight['updateTextStyle']['range']['tabId'] = brief_tab_id
            requests.append(req_highlight)
            
    if requests:
        docs_service.documents().batchUpdate(documentId=doc_id, body={'requests': requests}).execute()

def write_proposal_tab(docs_service, doc_id, proposals):
    """
    Locates the 'Proposal' tab in the document. If it exists, deletes it.
    Then creates a new 'Proposal' tab and writes the serialized proposals list into it.
    """
    log.info("Rewriting Proposal document tab...")
    doc = docs_service.documents().get(documentId=doc_id, includeTabsContent=True).execute()
    
    existing_tab_id = None
    if 'tabs' in doc:
        for tab in doc['tabs']:
            if tab.get('tabProperties', {}).get('title') == 'Proposal':
                existing_tab_id = tab['tabProperties']['tabId']
                break
                
    cleanup_reqs = []
    if existing_tab_id:
        cleanup_reqs.append({'deleteTab': {'tabId': existing_tab_id}})
        docs_service.documents().batchUpdate(documentId=doc_id, body={'requests': cleanup_reqs}).execute()
        log.info(f"Deleted existing Proposal tab ({existing_tab_id})")
        
    # Create a new "Proposal" tab
    create_reqs = [{
        'addDocumentTab': {
            'tabProperties': {
                'title': 'Proposal'
            }
        }
    }]
    
    res = docs_service.documents().batchUpdate(documentId=doc_id, body={'requests': create_reqs}).execute()
    new_tab_id = res['replies'][0]['addDocumentTab']['tabProperties']['tabId']
    log.info(f"Created new Proposal tab with ID: {new_tab_id}")
    
    # Serialize proposals to text lines
    # Format: PROP-ID|Type|Label|Proposed New Value|Evidence Reason
    serialized_lines = []
    for p in proposals:
        line = f"{p['id']}|{p['type']}|{p['label']}|{p.get('old_value', '')}|{p['new_value']}|{p.get('insert_after_label', '')}|{p['reason']}"
        serialized_lines.append(line)
        
    text_content = "\n".join(serialized_lines) + "\n" if serialized_lines else ""
    
    if text_content:
        # Insert text to the body of the new tab
        insert_reqs = [{
            'insertText': {
                'endOfSegmentLocation': {
                    'tabId': new_tab_id,
                    'segmentId': ''
                },
                'text': text_content
            }
        }]
        docs_service.documents().batchUpdate(documentId=doc_id, body={'requests': insert_reqs}).execute()
        log.info("Successfully wrote proposals to the tab.")
