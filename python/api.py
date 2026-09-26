"""JSON routes for the existing frontend screens."""
from flask import Blueprint, request
from python.data_loader import get_data, options, require_major
from python.pathways import build_pathways
from python.roles import role_detail
from python.recommendations import recommend
from python.engagement import engagement
from python.advisor import answer

api = Blueprint('api', __name__, url_prefix='/api')


@api.errorhandler(ValueError)
def bad_input(error):
    return {'error': str(error)}, 400


@api.get('/options')
def get_options():
    return options()


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
    for key in ('question', 'major', 'role', 'student', 'season'):
        if key in payload and not isinstance(payload[key], str):
            raise ValueError(f'{key} must be text.')
    question = payload.get('question', '').strip()
    if not question or len(question) > 500:
        raise ValueError('Ask a question between 1 and 500 characters.')
    return answer(question, payload.get('major', 'cs'), payload.get('role', ''), payload.get('student') or None, payload.get('season', 'Spring'))
