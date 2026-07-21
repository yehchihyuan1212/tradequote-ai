import base64
import os.path
import re
from email.mime.text import MIMEText
from email.utils import parseaddr

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
]


def _service():
    creds = None
    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file("credentials.json", SCOPES)
            creds = flow.run_local_server(port=0)
        with open("token.json", "w") as f:
            f.write(creds.to_json())
    return build("gmail", "v1", credentials=creds)


def _html_to_text(html):
    """HTML 信件轉純文字，讓 LLM 讀得懂。"""
    html = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.DOTALL | re.I)
    html = re.sub(r"<br\s*/?>|</p>|</div>|</tr>", "\n", html, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    text = (text.replace("&nbsp;", " ").replace("&amp;", "&")
                .replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"'))
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n\n", text).strip()


def _extract_body(payload):
    """優先取純文字；只有 HTML 時才轉換。"""
    plain, html = None, None

    def walk(part):
        nonlocal plain, html
        mime = part.get("mimeType", "")
        data = part.get("body", {}).get("data")
        if data:
            decoded = base64.urlsafe_b64decode(data).decode("utf-8", "ignore")
            if mime == "text/plain" and plain is None:
                plain = decoded
            elif mime == "text/html" and html is None:
                html = decoded
        for sub in part.get("parts", []):
            walk(sub)

    walk(payload)
    if plain:
        return plain.replace("\r\n", "\n").replace("\r", "\n").strip()
    if html:
        return _html_to_text(html)
    return ""



def fetch_new(max_results=10, query="is:unread"):
    svc = _service()
    res = svc.users().messages().list(
        userId="me", q=query, maxResults=max_results
    ).execute()

    emails = []
    for m in res.get("messages", []):
        msg = svc.users().messages().get(
            userId="me", id=m["id"], format="full"
        ).execute()
        headers = {h["name"]: h["value"] for h in msg["payload"]["headers"]}
        name, addr = parseaddr(headers.get("From", ""))
        emails.append({
            "message_id": m["id"],
            "sender_name": name or addr,
            "sender_email": addr,
            "subject": headers.get("Subject", ""),
            "date": headers.get("Date", ""),
            "body": _extract_body(msg["payload"]),
        })
    return emails


def create_draft(to, subject, body):
    svc = _service()
    msg = MIMEText(body)
    msg["to"] = to
    msg["subject"] = subject
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    draft = svc.users().drafts().create(
        userId="me", body={"message": {"raw": raw}}
    ).execute()
    return draft["id"]