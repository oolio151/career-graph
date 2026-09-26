"""Person-level activity associations, separate from course-derived skills."""
from collections import Counter
from python.data_loader import get_data, slug


def engagement(major, role_id, student_id=None):
    db = get_data()
    jobs = db.role_jobs(role_id, major)
    people = sorted({r['campus_id'] for r in jobs})
    if student_id:
        db.student(student_id, major)
    own = Counter(r['experience_type'] for r in db.experiences.get(student_id, []))
    activities = []
    for kind in db.activity_types:
        participants = [p for p in people if any(r['experience_type'] == kind for r in db.experiences[p])]
        names = Counter()
        for person in participants:
            names.update({r['experience_name'] for r in db.experiences[person] if r['experience_type'] == kind})
        activities.append({'id': slug(kind), 'name': kind, 'count': len(participants),
                           'percent': round(100 * len(participants) / len(people)) if people else None,
                           'student_count': own[kind], 'examples': [{'name': name, 'count': count}
                           for name, count in sorted(names.items(), key=lambda x: (-x[1], x[0]))[:3]],
                           'record_ids': [r['record_id'] for person in participants[:3]
                                          for r in db.experiences[person] if r['experience_type'] == kind][:5]})
    examples = []
    for person in people[:3]:
        alum = db.alumni[person]
        examples.append({'campus_id': person, 'track': alum['track'], 'year': alum['graduation_year'],
                         'activities': sorted({r['experience_type'] for r in db.experiences[person]}),
                         'jobs': [{'title': j['job_title'], 'role_id': j['role_id'], 'start': j['start_date']}
                                  for j in db.jobs_by_person[person]]})
    return {'role_id': role_id, 'major': major, 'cohort_count': len(people),
            'activities': sorted(activities, key=lambda a: (-a['count'], a['name'])),
            'examples': examples,
            'note': 'Unique bachelor’s alumni in the selected major who held this role. Activity histories span their enrollment; associations do not establish causation or hiring probability.'}
