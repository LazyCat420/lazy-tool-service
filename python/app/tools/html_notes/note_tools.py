import os
import requests
from typing import List, Dict, Any, Optional
from app.tools.registry import registry, PermissionLevel

HTML_NOTES_API_URL = os.environ.get("HTML_NOTES_API_URL", "http://10.0.0.16:8035")

@registry.register(
    name="html_notes_create_note",
    description="Create a new note in the HTML Notes database with a title, sanitized HTML fragment, tags, and optional backlinks.",
    parameters={
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Title of the note"
            },
            "rendered_html": {
                "type": "string",
                "description": "HTML note content using approved subset tags: article, section, p, ul, ol, li, blockquote, hr, strong, em, code, pre, a"
            },
            "tags": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of tags to categorize the note"
            },
            "links": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional list of note IDs to link to"
            }
        },
        "required": ["title", "rendered_html"]
    },
    permission=PermissionLevel.WRITE
)
def html_notes_create_note(title: str, rendered_html: str, tags: List[str] = [], links: List[str] = []) -> str:
    """Creates a new note in the HTML Notes service."""
    url = f"{HTML_NOTES_API_URL}/notes/create"
    payload = {
        "title": title,
        "rendered_html": rendered_html,
        "tags": tags,
        "links": links
    }
    try:
        r = requests.post(url, json=payload, timeout=10)
        if r.status_code == 200:
            res_data = r.json()
            return f"Successfully created note '{title}' with ID: '{res_data.get('id')}'"
        else:
            return f"Failed to create note: API returned {r.status_code} - {r.text}"
    except Exception as e:
        return f"Error connecting to HTML Notes service at {url}: {str(e)}"

@registry.register(
    name="html_notes_update_note",
    description="Update the content, title, tags, or links of an existing note in the HTML Notes database.",
    parameters={
        "type": "object",
        "properties": {
            "note_id": {
                "type": "string",
                "description": "The unique note ID to update (e.g., 'note_123')"
            },
            "title": {
                "type": "string",
                "description": "Optional updated title"
            },
            "rendered_html": {
                "type": "string",
                "description": "Optional updated HTML content fragment"
            },
            "tags": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional updated list of tags"
            },
            "links": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Optional updated list of target link note IDs"
            }
        },
        "required": ["note_id"]
    },
    permission=PermissionLevel.WRITE
)
def html_notes_update_note(
    note_id: str,
    title: Optional[str] = None,
    rendered_html: Optional[str] = None,
    tags: Optional[List[str]] = None,
    links: Optional[List[str]] = None
) -> str:
    """Updates an existing note in the HTML Notes database."""
    url = f"{HTML_NOTES_API_URL}/notes/update"
    payload = {"note_id": note_id}
    if title is not None:
        payload["title"] = title
    if rendered_html is not None:
        payload["rendered_html"] = rendered_html
    if tags is not None:
        payload["tags"] = tags
    if links is not None:
        payload["links"] = links
        
    try:
        r = requests.post(url, json=payload, timeout=10)
        if r.status_code == 200:
            return f"Successfully updated note '{note_id}'."
        else:
            return f"Failed to update note: API returned {r.status_code} - {r.text}"
    except Exception as e:
        return f"Error connecting to HTML Notes service at {url}: {str(e)}"

@registry.register(
    name="html_notes_get_note",
    description="Retrieve the details and full HTML content of a specific note by its ID.",
    parameters={
        "type": "object",
        "properties": {
            "note_id": {
                "type": "string",
                "description": "The note ID to fetch"
            }
        },
        "required": ["note_id"]
    },
    permission=PermissionLevel.READ_ONLY
)
def html_notes_get_note(note_id: str) -> str:
    """Retrieves a single note detail."""
    url = f"{HTML_NOTES_API_URL}/notes/{note_id}"
    try:
        r = requests.get(url, timeout=5)
        if r.status_code == 200:
            res_data = r.json()
            note = res_data.get("note", {})
            return f"Note Found:\nID: {note.get('id')}\nTitle: {note.get('title')}\nVersion: {note.get('version')}\nTags: {note.get('tags')}\nHTML:\n{note.get('rendered_html')}"
        else:
            return f"Note '{note_id}' not found (API returned {r.status_code})."
    except Exception as e:
        return f"Error connecting to HTML Notes service at {url}: {str(e)}"

@registry.register(
    name="html_notes_search_notes",
    description="Search notes in the HTML Notes database matching a specific query term.",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search keyword or tag name"
            }
        },
        "required": ["query"]
    },
    permission=PermissionLevel.READ_ONLY
)
def html_notes_search_notes(query: str) -> str:
    """Searches notes matching the query."""
    url = f"{HTML_NOTES_API_URL}/search"
    try:
        r = requests.get(url, params={"q": query}, timeout=5)
        if r.status_code == 200:
            notes = r.json()
            if not notes:
                return f"No notes found matching '{query}'"
            out = [f"Found {len(notes)} notes:"]
            for n in notes:
                out.append(f"- ID: {n['id']}, Title: {n['title']}, Tags: {n['tags']}, Version: {n['version']}")
            return "\n".join(out)
        else:
            return f"Failed to search notes (API returned {r.status_code})."
    except Exception as e:
        return f"Error connecting to HTML Notes service at {url}: {str(e)}"

@registry.register(
    name="html_notes_link_notes",
    description="Establish a hyperlink connection between a source note and a target note.",
    parameters={
        "type": "object",
        "properties": {
            "source_note_id": {
                "type": "string",
                "description": "ID of the source note"
            },
            "target_note_id": {
                "type": "string",
                "description": "ID of the target note to connect to"
            }
        },
        "required": ["source_note_id", "target_note_id"]
    },
    permission=PermissionLevel.WRITE
)
def html_notes_link_notes(source_note_id: str, target_note_id: str) -> str:
    """Links two notes together."""
    url = f"{HTML_NOTES_API_URL}/notes/link"
    payload = {
        "source_note_id": source_note_id,
        "target_note_id": target_note_id
    }
    try:
        r = requests.post(url, json=payload, timeout=10)
        if r.status_code == 200:
            return f"Successfully linked note '{source_note_id}' to note '{target_note_id}'."
        else:
            return f"Failed to link notes: API returned {r.status_code} - {r.text}"
    except Exception as e:
        return f"Error connecting to HTML Notes service at {url}: {str(e)}"

@registry.register(
    name="html_notes_modify_dom",
    description="Precisely modify a specific part of a note's HTML using CSS selectors. Use this to insert tables, sidebars, or other components relative to existing elements.",
    parameters={
        "type": "object",
        "properties": {
            "note_id": {
                "type": "string",
                "description": "The ID of the note to modify"
            },
            "css_selector": {
                "type": "string",
                "description": "A valid CSS selector to locate the target element (e.g., '#main-content', '.sidebar', 'table:nth-of-type(1)')"
            },
            "action": {
                "type": "string",
                "enum": ["append", "prepend", "insert_before", "insert_after", "replace"],
                "description": "The DOM operation to perform relative to the matched element"
            },
            "html_snippet": {
                "type": "string",
                "description": "The raw HTML string to insert or replace with"
            }
        },
        "required": ["note_id", "css_selector", "action", "html_snippet"]
    },
    permission=PermissionLevel.WRITE
)
def html_notes_modify_dom(note_id: str, css_selector: str, action: str, html_snippet: str) -> str:
    """Modifies a specific part of a note's DOM."""
    # First, fetch the note
    url = f"{HTML_NOTES_API_URL}/notes/{note_id}"
    try:
        r = requests.get(url, timeout=5)
        if r.status_code != 200:
            return f"Note '{note_id}' not found (API returned {r.status_code})."
        res_data = r.json()
        note = res_data.get("note", {})
        original_html = note.get("rendered_html", "")
    except Exception as e:
        return f"Error connecting to HTML Notes service at {url}: {str(e)}"

    # Parse with BeautifulSoup
    from bs4 import BeautifulSoup
    try:
        soup = BeautifulSoup(original_html, "html.parser")
        target_el = soup.select_one(css_selector)
        
        if not target_el:
            return f"Error: Could not find any element matching CSS selector '{css_selector}'."
            
        new_soup = BeautifulSoup(html_snippet, "html.parser")
        
        if action == "append":
            target_el.append(new_soup)
        elif action == "prepend":
            target_el.insert(0, new_soup)
        elif action == "insert_before":
            target_el.insert_before(new_soup)
        elif action == "insert_after":
            target_el.insert_after(new_soup)
        elif action == "replace":
            target_el.replace_with(new_soup)
        else:
            return f"Error: Unknown action '{action}'."
            
        modified_html = str(soup)
    except Exception as e:
        return f"Error parsing or modifying DOM: {str(e)}"
        
    # Send the updated HTML back to the API
    update_url = f"{HTML_NOTES_API_URL}/notes/update"
    payload = {
        "note_id": note_id,
        "rendered_html": modified_html
    }
    try:
        ur = requests.post(update_url, json=payload, timeout=10)
        if ur.status_code == 200:
            return f"Successfully modified note '{note_id}' at selector '{css_selector}'."
        else:
            return f"Failed to update note after DOM manipulation: API returned {ur.status_code} - {ur.text}"
    except Exception as e:
        return f"Error sending updated HTML to Notes service: {str(e)}"
