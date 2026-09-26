"""Explainable course coverage and prerequisite-aware suggestions."""
from collections import Counter
from python.data_loader import get_data, split_tags, MAJORS


def recommend(student_id, role_id, season='Spring'):
    if season not in {'Spring', 'Summer', 'Fall'}:
        raise ValueError('Choose Spring, Summer, or Fall.')
    db = get_data()
    student = db.student(student_id)
    major = next(key for key, name in MAJORS.items() if name == student['major'])
    jobs = db.role_jobs(role_id, major)
    counts = Counter(s for j in jobs for s in split_tags(j['role_skill_tags']))
    target = set(counts)
    attempts = db.transcripts[student_id]
    completed = {r['course_id'] for r in attempts if int(r['credits_earned']) > 0}
    progress = {r['course_id'] for r in attempts if r['grade'] == 'IP'} - completed
    covered = set().union(*(split_tags(db.courses[c]['skill_tags']) for c in completed))
    pending = set().union(*(split_tags(db.courses[c]['skill_tags']) for c in progress)) - covered
    gaps = target - covered - pending
    courses, candidates, blocked = [], [], []
    for course_id, course in sorted(db.courses.items()):
        relevant = split_tags(course['skill_tags']) & target
        if not relevant:
            continue
        prereqs = [group.split(' or ') for group in sorted(split_tags(course['prerequisite_ids']))]
        missing = [' or '.join(group) for group in prereqs if not set(group) & completed]
        seasons = sorted(split_tags(course['typical_terms_offered']))
        status = 'completed' if course_id in completed else 'in_progress' if course_id in progress else 'not_taken'
        item = {'id': course_id, 'title': course['course_title'], 'credits': int(course['credits']),
                'skills': sorted(relevant), 'new_skills': sorted(relevant & gaps), 'status': status,
                'prerequisites': prereqs, 'missing_prerequisites': missing, 'seasons': seasons,
                'difficulty': float(course['difficulty_index'])}
        if status != 'not_taken':
            courses.append(item)
        elif item['new_skills']:
            if not missing and season in seasons:
                candidates.append(item)
            else:
                blocked.append(item)
    suggestions = []
    remaining = set(gaps)
    for _ in range(3):
        useful = [c for c in candidates if remaining & set(c['new_skills'])]
        if not useful:
            break
        best = min(useful, key=lambda c: (-sum(counts[s] for s in remaining & set(c['new_skills'])),
                                         c['difficulty'], c['id']))
        suggestions.append({**best, 'additional_skills': sorted(remaining & set(best['new_skills']))})
        remaining -= set(best['new_skills'])
        candidates.remove(best)
    return {'student': student, 'role_id': role_id, 'season': season,
            'coverage': {'covered': len(target & covered), 'total': len(target),
                         'percent': round(100 * len(target & covered) / len(target)) if target else None},
            'covered_skills': sorted(target & covered), 'in_progress_skills': sorted(target & pending),
            'missing_skills': sorted(gaps), 'courses': courses, 'suggestions': suggestions,
            'blocked_courses': sorted(blocked, key=lambda c: (-len(c['new_skills']), c['id']))[:6],
            'note': 'Earned course credit indicates exposure, not mastery. Minimum prerequisite grades, transfer equivalencies, and seat availability are not supplied; confirm eligibility with an advisor.'}
