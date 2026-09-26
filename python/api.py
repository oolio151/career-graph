"""JSON routes for the existing frontend screens."""
from flask import Blueprint, request, session
from python.data_loader import get_data, options, require_major
from python.pathways import build_pathways
from python.roles import role_detail
from python.recommendations import recommend
from python.engagement import engagement
from python.advisor import answer
from python.gemini import AdvisorUnavailable, advisor_status
from python.resume_upload import MAX_FILE_BYTES, extract_resume
from python.resume_review import review_resume

api = Blueprint('api', __name__, url_prefix='/api')


@api.before_request
def resume_request_limits():
    # Flask 3.1 supports per-request limits; keep the existing chat limit intact.
    if request.endpoint == 'api.extract_resume_text':
        request.max_content_length = MAX_FILE_BYTES + 64 * 1024
    elif request.endpoint == 'api.resume_review':
        request.max_content_length = 128 * 1024


@api.after_request
def resume_no_cache(response):
    if request.endpoint in {'api.extract_resume_text', 'api.resume_review'}:
        response.headers['Cache-Control'] = 'no-store'
    return response


@api.errorhandler(413)
def too_large(error):
    return {'error': 'The request is too large. Resume files must be under 2 MB; other requests must fit their text limits.'}, 413


@api.post('/resume/extract')
def extract_resume_text():
    uploads = request.files.getlist('resume')
    if len(uploads) != 1 or not uploads[0].filename:
        raise ValueError('Upload one resume file.')
    return {'text': extract_resume(uploads[0]), 'note': 'Review the extracted text before sending it to Gemini.'}


@api.post('/resume/review')
def resume_review():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ValueError('Send a JSON object.')
    for field in ('text', 'major', 'role'):
        if not isinstance(payload.get(field), str):
            raise ValueError(f'{field} must be text.')
    include_profile = payload.get('include_profile', False)
    if not isinstance(include_profile, bool):
        raise ValueError('include_profile must be true or false.')
    student_id = session.get('campus_id') if include_profile else None
    if include_profile and not student_id:
        raise ValueError('Select a campus profile first, or turn off profile context.')
    return review_resume(payload['text'], payload['major'], payload['role'], student_id)


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
