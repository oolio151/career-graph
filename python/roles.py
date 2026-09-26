"""Role skill frequencies, salary distributions, and neighboring roles."""
from collections import Counter, defaultdict
from python.data_loader import get_data, split_tags


def percentile(values, fraction):
    ordered = sorted(values)
    index = (len(ordered) - 1) * fraction
    lower = int(index)
    upper = min(lower + 1, len(ordered) - 1)
    return round(ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower))


def role_detail(role_id, major, region=None, year=None):
    db = get_data()
    role = db.role(role_id)
    jobs = db.role_jobs(role_id, major)
    frequency = Counter(skill for row in jobs for skill in split_tags(row['role_skill_tags']))
    skills = [{'name': name, 'count': count, 'percent': round(100 * count / len(jobs))}
              for name, count in sorted(frequency.items(), key=lambda x: (-x[1], x[0]))]
    if region and region not in db.regions:
        raise ValueError('Choose a region present in the dataset.')
    salary_jobs = [j for j in jobs if not region or j['region'] == region]
    available_years = sorted({int(j['start_date'][:4]) for j in salary_jobs}, reverse=True)
    selected_year = year if year is not None else (available_years[0] if available_years else None)
    salary_jobs = [j for j in salary_jobs if int(j['start_date'][:4]) == selected_year]
    salaries = [int(j['annual_salary_usd']) for j in salary_jobs]
    salary = {'count': len(salaries), 'year': selected_year, 'region': region or 'All regions',
              'median': percentile(salaries, .5) if salaries else None,
              'p25': percentile(salaries, .25) if salaries else None,
              'p75': percentile(salaries, .75) if salaries else None,
              'available_years': available_years,
              'note': 'Nominal base salary in the job’s start year. Synthetic records; not a market forecast.'}
    previous, following = defaultdict(set), defaultdict(set)
    for person in sorted({j['campus_id'] for j in jobs}):
        history = db.jobs_by_person[person]
        for before, after in zip(history, history[1:]):
            if before['role_id'] == after['role_id']:
                continue
            if after['role_id'] == role_id:
                previous[before['role_id']].add(person)
            if before['role_id'] == role_id:
                following[after['role_id']].add(person)
    def neighbors(group):
        return [{**db.roles[r], 'count': len(people)}
                for r, people in sorted(group.items(), key=lambda x: (-len(x[1]), x[0]))[:5]]
    courses = [{'id': c['course_id'], 'title': c['course_title'],
                'skills': sorted(split_tags(c['skill_tags']) & set(frequency))}
               for c in db.courses.values() if split_tags(c['skill_tags']) & set(frequency)]
    return {**role, 'major': major, 'record_count': len(jobs),
            'alumni_count': len({j['campus_id'] for j in jobs}), 'skills': skills,
            'salary': salary, 'previous_roles': neighbors(previous), 'next_roles': neighbors(following),
            'courses': sorted(courses, key=lambda c: (-len(c['skills']), c['id'])),
            'source': {'file': 'employment_history.csv', 'record_ids': [j['job_id'] for j in jobs[:5]],
                       'count': len(jobs)}}
