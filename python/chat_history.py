"""Bounded server-side conversation storage alongside session uploads."""
import json
import os
import tempfile

MAX_EXCHANGES = 8
MAX_CHARACTERS = 12000


def bounded_history(exchanges):
    kept, size = [], 0
    for turn in reversed(exchanges[-MAX_EXCHANGES:]):
        if not isinstance(turn, dict) or not all(isinstance(turn.get(k), str) for k in ('user', 'advisor')):
            continue
        length = len(turn['user']) + len(turn['advisor'])
        if size + length > MAX_CHARACTERS:
            break
        kept.append({'user': turn['user'], 'advisor': turn['advisor']})
        size += length
    return list(reversed(kept))


def read_history(path):
    try:
        data = json.loads(path.read_text())
        return bounded_history(data) if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def write_history(path, exchanges):
    # Atomic replacement prevents a reader seeing partially written JSON.
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False, encoding='utf-8') as output:
            temporary = output.name
            json.dump(bounded_history(exchanges), output)
        os.replace(temporary, path)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)
