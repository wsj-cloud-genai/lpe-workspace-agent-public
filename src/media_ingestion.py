import os
import logging
import firebase_admin
from firebase_admin import storage
import urllib.parse
try:
    import google_workspace
except ImportError:
    try:
        from docs.projects.hackathon.src import google_workspace
    except ImportError:
        import sys
        import os
        # Fallback to local import by adding the module directory to sys.path
        module_dir = os.path.dirname(os.path.abspath(__file__))
        if module_dir not in sys.path:
            sys.path.append(module_dir)
        import google_workspace

log = logging.getLogger("lpe-api")

# Google Firebase Storage bucket name
BUCKET_NAME = os.environ.get("FIREBASE_STORAGE_BUCKET", "<YOUR_PROJECT_ID>.firebasestorage.app")

def ingest_client_media_assets(client_id: str, drive_folder_id: str):
    """
    Scans a client's Drive folder for media assets (images, videos, PDFs),
    downloads them, uploads them to GCS Firebase Storage, and returns a list
    of assets with public CDN URLs.
    
    Returns:
        List[Dict[str, str]]: [ { "name": str, "mime_type": str, "cdn_url": str } ]
    """
    if not drive_folder_id:
        log.info(f"[MEDIA_INGEST] Empty drive_folder_id for client '{client_id}'. Skipping media sync.")
        return []
        
    log.info(f"[MEDIA_INGEST] Scanning folder '{drive_folder_id}' for client '{client_id}'...")
    
    try:
        files = google_workspace.list_files_in_folder(drive_folder_id)
    except Exception as e:
        log.error(f"[MEDIA_INGEST] Failed to list files in folder '{drive_folder_id}': {e}")
        return []
        
    ingested_assets = []
    
    for f in files:
        file_id = f.get('id')
        file_name = f.get('name', '')
        mime_type = f.get('mimeType', '')
        
        # Skip Google App types (Doc, Sheet, Slides, etc.)
        if mime_type.startswith("application/vnd.google-apps."):
            continue
            
        # Determine if it's a valid media asset (image, video, or PDF)
        is_media = (
            mime_type.startswith("image/") or
            mime_type.startswith("video/") or
            mime_type == "application/pdf" or
            file_name.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4", ".mov", ".pdf"))
        )
        
        if not is_media:
            log.info(f"[MEDIA_INGEST] Skipping non-media file: '{file_name}' (Type: {mime_type})")
            continue
            
        log.info(f"[MEDIA_INGEST] Ingesting media asset: '{file_name}' (Type: {mime_type})")
        
        # 1. Download file content from Google Drive as raw binary bytes
        try:
            file_bytes = google_workspace.download_drive_file_binary(file_id)
        except Exception as ex:
            log.error(f"[MEDIA_INGEST] Failed to download file '{file_name}' ({file_id}) from Drive: {ex}")
            continue
            
        # 2. Upload file to Firebase Cloud Storage
        try:
            # Format destination path in bucket: assets/client-materials/{client_id}/{filename}
            destination_path = f"assets/client-materials/{client_id}/{file_name}"
            
            # Ensure Firebase admin is initialized
            bucket = storage.bucket(BUCKET_NAME)
            blob = bucket.blob(destination_path)
            
            # Determine content type based on extension
            content_type = mime_type or "application/octet-stream"
            if not content_type or content_type == "application/octet-stream":
                if file_name.lower().endswith(".png"):
                    content_type = "image/png"
                elif file_name.lower().endswith((".jpg", ".jpeg")):
                    content_type = "image/jpeg"
                elif file_name.lower().endswith(".webp"):
                    content_type = "image/webp"
                elif file_name.lower().endswith(".mp4"):
                    content_type = "video/mp4"
                elif file_name.lower().endswith(".pdf"):
                    content_type = "application/pdf"
                    
            blob.upload_from_string(file_bytes, content_type=content_type)
            
            # Generate public Firebase storage alt=media URL
            safe_name = urllib.parse.quote(blob.name, safe="")
            public_url = f"https://firebasestorage.googleapis.com/v0/b/{bucket.name}/o/{safe_name}?alt=media"
            
            log.info(f"[MEDIA_INGEST] Successfully uploaded '{file_name}' to GCS. Public CDN URL: {public_url}")
            
            ingested_assets.append({
                "name": file_name,
                "mime_type": content_type,
                "cdn_url": public_url
            })
            
        except Exception as ex:
            log.error(f"[MEDIA_INGEST] Failed to upload file '{file_name}' to Firebase GCS: {ex}")
            continue
            
    return ingested_assets
