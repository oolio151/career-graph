"""Observed major-to-first-job and consecutive-job connections."""
from collections import defaultdict
from python.data_loader import get_data


def build_pathways(major, family='all', focus=None):
    db = get_data()
    if family != 'all' and family not in db.families:
        raise ValueError('Choose a valid career family.')
    if focus:
        db.role(focus)
    cohort = db.cohort(major)
    first = defaultdict(set)
    transitions = defaultdict(set)
    available = set()
    for person in sorted(cohort):
        jobs = db.jobs_by_person.get(person, [])
        if not jobs:
            continue
        for job in jobs:
            if family == 'all' or job['job_family'] == family:
                available.add(job['role_id'])
        if family == 'all' or jobs[0]['job_family'] == family:
            first[jobs[0]['role_id']].add(person)
        for before, after in zip(jobs, jobs[1:]):
            if before['role_id'] == after['role_id']:
                continue
            if family != 'all' and (before['job_family'] != family or after['job_family'] != family):
                continue
            transitions[(before['role_id'], after['role_id'])].add(person)
    first_ids = sorted(first, key=lambda r: (-len(first[r]), r))[:3]
    if focus in first and focus not in first_ids:
        first_ids = [focus] + first_ids[:2]
    elif focus in available:
        incoming = sorted((a for (a, b) in transitions if b == focus and a in first),
                          key=lambda a: (-len(transitions[(a, focus)]), a))
        if incoming and incoming[0] not in first_ids:
            first_ids = [incoming[0]] + first_ids[:2]
    next_people = defaultdict(set)
    for (source, target), people in transitions.items():
        if source in first_ids and target not in first_ids:
            next_people[target].update(people)
    next_ids = sorted(next_people, key=lambda r: (-len(next_people[r]), r))[:3]
    if focus in next_people and focus not in next_ids:
        next_ids = [focus] + next_ids[:2]
    nodes = [{**db.roles[r], 'column': col, 'row': index,
              'count': len(first[r]) if col == 0 else len(next_people[r])}
             for col, ids in enumerate((first_ids, next_ids)) for index, r in enumerate(ids)]
    edges = [{'source': 'degree', 'target': r, 'count': len(first[r]), 'kind': 'first_job',
              'examples': sorted(first[r])[:3]} for r in first_ids]
    edges += [{'source': a, 'target': b, 'count': len(people), 'kind': 'transition',
               'examples': sorted(people)[:3]}
              for (a, b), people in sorted(transitions.items()) if a in first_ids and b in next_ids]
    return {'major': major, 'family': family, 'nodes': nodes, 'edges': edges,
            'available_roles': sorted(available), 'role_count': len(available),
            'cohort_count': len(cohort), 'employed_count': sum(bool(db.jobs_by_person.get(p)) for p in cohort),
            'note': 'Connections count unique bachelor’s alumni. Later roles are observed consecutive jobs, not guaranteed promotions.'}
