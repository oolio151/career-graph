"""JSON routes for the existing frontend screens."""
from flask import Blueprint, request, session
from python.data_loader import get_data, options, require_major
from python.pathways import build_pathways
from python.roles import role_detail
from python.recommendations import recommend
from python.engagement import engagement
from python.advisor import answer
from python.gemini import AdvisorUnavailable, advisor_status

api = Blueprint('api', __name__, url_prefix='/api')


@api.errorhandler(ValueError)
def bad_input(error):
    return {'error': str(error)}, 400


@api.errorhandler(AdvisorUnavailable)
def provider_unavailable(error):
    return {'error': str(error), 'mode': 'gemini'}, 503


@api.get('/advisor/status')
def get_advisor_status():
    return advisor_status()


@api.get('/options')
def get_options():
    result = options()
    result['advisor_mode'] = advisor_status()['mode']
    return result


@api.get('/pathways')
def get_pathways():
    return build_pathways(request.args.get('major', 'cs'), request.args.get('family', 'all'), request.args.get('focus') or None)


@api.get('/roles/<role_id>')
def get_role(role_id):
    year = request.args.get('year')
    if year and (not year.isdigit() or int(year) not in get_data().years):
        raise ValueError('Choose a job start year present in the dataset.')
    return role_detail(role_id, request.args.get('major', 'cs'), request.args.get('region') or None, int(year) if year else None)


@api.get('/students')
def get_students():
    from python.data_loader import MAJORS
    major = require_major(request.args.get('major', 'cs'))
    return {'students': [get_data().student(person) for person, row in get_data().students.items() if row['major'] == MAJORS[major]]}


@api.get('/students/<student_id>/recommendations')
def get_recommendations(student_id):
    return recommend(student_id, request.args.get('role', ''), request.args.get('season', 'Spring'))


@api.get('/engagement')
def get_engagement():
    return engagement(request.args.get('major', 'cs'), request.args.get('role', ''), request.args.get('student') or None)


@api.post('/advisor')
def advisor():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ValueError('Send a JSON object.')
    for key in ('question', 'major', 'role', 'student', 'season', 'region', 'year'):
        if key in payload and not isinstance(payload[key], str):
            raise ValueError(f'{key} must be text.')
    question = payload.get('question', '').strip()
    if not question or len(question) > 500:
        raise ValueError('Ask a question between 1 and 500 characters.')
    history = payload.get('history', [])
    if not isinstance(history, list) or len(history) > 8 or len(history) % 2:
        raise ValueError('Send at most four complete conversation turns.')
    for index, turn in enumerate(history):
        expected = 'user' if index % 2 == 0 else 'model'
        if (not isinstance(turn, dict) or turn.get('role') != expected
                or not isinstance(turn.get('text'), str) or not turn['text'].strip()
                or len(turn['text']) > (500 if expected == 'user' else 3000)):
            raise ValueError('Conversation history must alternate user and model text within the allowed limits.')
    if sum(len(turn['text']) for turn in history) > 6000:
        raise ValueError('Conversation history must be at most 6000 characters.')
    preferences = {}
    for key, limit in (('saved_roles', 5), ('interests', 10)):
        values = payload.get(key, [])
        if (not isinstance(values, list) or len(values) > limit
                or any(not isinstance(value, str) or len(value) > 120 for value in values)):
            raise ValueError(f'{key} must be a bounded list of text IDs.')
        preferences[key] = list(dict.fromkeys(values))
    season = payload.get('season', 'Spring')
    if season not in {'Spring', 'Summer', 'Fall'}:
        raise ValueError('Choose Spring, Summer, or Fall.')
    year = payload.get('year', '')
    if year and (not year.isdigit() or int(year) not in get_data().years):
        raise ValueError('Choose a job start year present in the dataset.')
    # Explicit selections support the public synthetic-profile explorer. When
    # omitted, use the campus-ID session. This is not real account authentication.
    use_session = 'student' not in payload and bool(session.get('campus_id'))
    student_id = (session.get('campus_id') if use_session else payload.get('student')) or None
    major = payload.get('major', 'cs')
    if use_session:
        from python.data_loader import MAJORS
        profile = get_data().student(student_id)
        major = next(key for key, name in MAJORS.items() if name == profile['major'])
    return answer(question, major, payload.get('role', ''), student_id, season,
                  history=history, region=payload.get('region') or None,
                  year=int(year) if year else None, **preferences)
