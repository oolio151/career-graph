"""Select a synthetic dataset profile; this is not UMBC account authentication."""
import re
from flask import session
from python.data_loader import get_data


def select_profile(campus_id):
    if not re.fullmatch(r'CID-[0-9]{6}', campus_id):
        raise ValueError('Enter a campus ID in the form CID-123456, or use -1 for the demo.')
    if campus_id not in get_data().students:
        raise ValueError('That ID is not a current student in this dataset. Try CID-116490, or use -1 for the demo.')
    session.clear()
    session['campus_id'] = campus_id


def current_profile():
    campus_id = session.get('campus_id')
    if campus_id and campus_id in get_data().students:
        return get_data().student(campus_id)
    return None
