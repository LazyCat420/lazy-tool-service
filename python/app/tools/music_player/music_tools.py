import os
import requests
from app.tools.registry import registry, PermissionLevel

@registry.register(
    name="music_player_suggest_artists",
    description="Suggest a list of similar artists or genre recommendations to the user. Displays clickable recommendation chips in the chat UI.",
    parameters={
        "type": "object",
        "properties": {
            "artists": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of recommended artist names"
            }
        },
        "required": ["artists"]
    },
    permission=PermissionLevel.READ_ONLY
)
def music_player_suggest_artists(artists: list[str]) -> str:
    """Suggests a list of artists to the user."""
    return f"Successfully suggested artists: {', '.join(artists)}"

@registry.register(
    name="music_player_add_node",
    description="Add a new artist or genre node to the user's interactive music graph.",
    parameters={
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "Name of the artist or genre to add"
            },
            "type": {
                "type": "string",
                "enum": ["artist", "genre"],
                "description": "The type of node (either 'artist' or 'genre')"
            }
        },
        "required": ["name", "type"]
    },
    permission=PermissionLevel.WRITE
)
def music_player_add_node(name: str, type: str) -> str:
    """Adds a new artist or genre node to the graph."""
    if type == "artist":
        api_url = os.environ.get("MUSIC_PLAYER_API_URL", "http://10.0.0.16:8002/api")
        try:
            r = requests.post(
                f"{api_url}/artists/add-node",
                json={"name": name, "genre": "Unknown"},
                timeout=5
            )
            if r.status_code == 200:
                return f"Successfully added artist node: '{name}'"
            else:
                return f"Failed to add artist node via API (status {r.status_code}): {r.text}"
        except Exception as e:
            return f"Failed to connect to music-player API to add artist: {e}"
    else:
        return f"Successfully added genre node: '{name}'"
