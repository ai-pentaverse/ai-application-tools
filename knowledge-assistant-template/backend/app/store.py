"""
In-memory conversation store. This is a placeholder — swap for Postgres /
DynamoDB / whatever fits, keeping the same get/create/list interface so
main.py doesn't need to change.
"""

import uuid

_conversations: dict[str, dict] = {}


def list_conversations() -> list[dict]:
    return list(_conversations.values())


def create_conversation(title: str = "New question") -> dict:
    conv_id = str(uuid.uuid4())
    conv = {"id": conv_id, "title": title}
    _conversations[conv_id] = conv
    return conv


def get_or_create(conversation_id: str) -> dict:
    if conversation_id == "new" or conversation_id not in _conversations:
        return create_conversation()
    return _conversations[conversation_id]
