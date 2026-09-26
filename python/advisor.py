"""Gemini advisor with an explicit dataset-only mode when unconfigured."""
from python.data_loader import get_data
from python.roles import role_detail
from python.recommendations import recommend
from python.engagement import engagement
from python.gemini import advisor_status, generate
from python.advisor_context import SYSTEM_INSTRUCTION, build_context


def answer(question, major, role_id, student_id=None, season='Spring', *,
           history=None, saved_roles=None, interests=None, region=None, year=None):
    if not advisor_status()['configured']:
        return dataset_answer(question, major, role_id, student_id, season)
    context, sources, target_id = build_context(
        question, major, role_id, student_id, season, saved_roles or [],
        interests or [], region, year)
    return {'answer': generate(SYSTEM_INSTRUCTION, context, history or [], question),
            'sources': sources, 'mode': 'gemini', 'role_id': target_id,
            'model': advisor_status()['model']}


def dataset_answer(question, major, role_id, student_id=None, season='Spring'):
    db = get_data()
    text = question.lower()
    mentioned = next((r for r in sorted(db.roles.values(), key=lambda r: -len(r['title']))
                      if r['title'].lower() in text), None)
    if mentioned:
        role_id = mentioned['id']
    role = role_detail(role_id, major)
    if student_id:
        db.student(student_id, major)
    sources = [role['source']]
    intro = f"For {role['title']}, this dataset contains {role['record_count']} job records from {role['alumni_count']} bachelor’s alumni in your selected major."
    if not role['record_count']:
        return {'answer': intro + ' Choose another role or major to explore supported connections.', 'sources': sources, 'mode': 'dataset'}
    if any(word in text for word in ('salary', 'money', 'pay', 'cost', 'roi')):
        salary = role['salary']
        detail = (f"For jobs starting in {salary['year']}, the median base salary is ${salary['median']:,}; "
                  f"the middle 50% spans ${salary['p25']:,}–${salary['p75']:,}, across {salary['count']} records. "
                  'These are nominal dollars across regions in a synthetic dataset, not current market estimates. This is not a return-on-investment calculation.')
    elif any(word in text for word in ('experience', 'club', 'research', 'hackathon', 'engage', 'internship', 'activity')):
        result = engagement(major, role_id, student_id)
        relevant = [a for a in result['activities'] if a['name'].lower() in text]
        activities = relevant or result['activities'][:3]
        detail = 'Among these alumni: ' + '; '.join(f"{a['count']} of {result['cohort_count']} participated in {a['name']}" for a in activities) + '. These associations do not show that an activity causes a career outcome.'
        sources += [{'file': 'student_experience.csv', 'record_ids': a['record_ids'], 'count': a['count']} for a in activities]
    elif student_id:
        result = recommend(student_id, role_id, season)
        coverage = result['coverage']
        detail = (f"Your completed coursework covers {coverage['covered']} of {coverage['total']} role skills. "
                  f"{len(result['in_progress_skills'])} additional skills appear in your in-progress courses. ")
        if result['suggestions']:
            detail += f"For {season}, consider " + '; '.join(f"{c['id']} ({c['title']}) for {', '.join(c['additional_skills'])}" for c in result['suggestions']) + '. '
        else:
            detail += 'No additional course currently meets the season and prerequisite filters for uncovered skills. Check the course panel for constraints. '
        detail += 'Course credit indicates exposure, not mastery; confirm eligibility and availability with an advisor.'
        sources += [{'file': 'course_catalog.csv', 'record_ids': [c['id'] for c in result['suggestions']], 'count': len(result['suggestions'])},
                    {'file': 'transcripts.csv', 'record_ids': [student_id], 'count': len(db.transcripts[student_id])}]
    else:
        detail = 'Frequently listed skills include ' + ', '.join(f"{s['name']} ({s['percent']}% of records)" for s in role['skills'][:5]) + '. '
        detail += 'Explore courses such as ' + ', '.join(c['id'] for c in role['courses'][:3]) + '. Select a student profile to compare completed coursework and prerequisite-aware next steps.'
    return {'answer': intro + '\n\n' + detail + '\n\nThis advisor summarizes the supplied data; live generative AI is not connected.',
            'sources': sources, 'mode': 'dataset', 'role_id': role_id}
