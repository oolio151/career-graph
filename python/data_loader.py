"""Read the supplied snapshot once and share indexed records across services."""
import csv
import re
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / 'data'
MAJORS = {'cs': 'Computer Science', 'is': 'Information Systems'}
SNAPSHOT = '2026-09-15'


def split_tags(value):
    return set(value.split('|')) if value and value != 'Not Applicable' else set()


def slug(value):
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')


def require_major(value):
    if value not in MAJORS:
        raise ValueError('Choose Computer Science or Information Systems.')
    return value


class Dataset:
    def __init__(self, directory=DATA_DIR):
        def read(name):
            with (directory / f'{name}.csv').open(encoding='utf-8', newline='') as handle:
                return list(csv.DictReader(handle))
        self.students = {r['campus_id']: r for r in read('students_current')}
        self.alumni = {r['campus_id']: r for r in read('alumni')}
        self.courses = {r['course_id']: r for r in read('course_catalog')}
        self.transcripts = defaultdict(list)
        self.experiences = defaultdict(list)
        self.jobs_by_person = defaultdict(list)
        self.jobs_by_role = defaultdict(list)
        self.roles = {}
        self.jobs = read('employment_history')
        for row in read('transcripts'):
            self.transcripts[row['campus_id']].append(row)
        for row in read('student_experience'):
            self.experiences[row['campus_id']].append(row)
        for row in self.jobs:
            role_id = slug(row['job_title'])
            row['role_id'] = role_id
            self.roles[role_id] = {'id': role_id, 'title': row['job_title'], 'family': row['job_family']}
            self.jobs_by_role[role_id].append(row)
            self.jobs_by_person[row['campus_id']].append(row)
        for jobs in self.jobs_by_person.values():
            jobs.sort(key=lambda r: (r['start_date'], r['job_id']))
        for role_id, role in self.roles.items():
            role['majors'] = [key for key, name in MAJORS.items()
                              if any(self.alumni[j['campus_id']]['major'] == name
                                     and self.alumni[j['campus_id']]['degree_level'] == 'Bachelor of Science'
                                     for j in self.jobs_by_role[role_id])]
        self.families = sorted({r['job_family'] for r in self.jobs})
        self.activity_types = sorted({r['experience_type'] for rows in self.experiences.values() for r in rows})
        self.regions = sorted({r['region'] for r in self.jobs})
        self.years = sorted({int(r['start_date'][:4]) for r in self.jobs}, reverse=True)

    def cohort(self, major):
        require_major(major)
        return {person for person, alum in self.alumni.items()
                if alum['major'] == MAJORS[major] and alum['degree_level'] == 'Bachelor of Science'}

    def role(self, role_id):
        if role_id not in self.roles:
            raise ValueError('Choose a role present in the dataset.')
        return self.roles[role_id]

    def student(self, campus_id, major=None):
        if campus_id not in self.students:
            raise ValueError('Choose a valid student profile.')
        row = self.students[campus_id]
        if major and row['major'] != MAJORS[require_major(major)]:
            raise ValueError('The student profile must match the selected major.')
        return {key: None if value == 'Not Applicable' else value for key, value in row.items()}

    def role_jobs(self, role_id, major):
        self.role(role_id)
        cohort = self.cohort(major)
        return [r for r in self.jobs_by_role[role_id] if r['campus_id'] in cohort]


def options():
    db = get_data()
    return {'majors': [{'id': key, 'name': value} for key, value in MAJORS.items()],
            'roles': sorted(db.roles.values(), key=lambda r: r['title']),
            'families': db.families, 'regions': db.regions, 'years': db.years,
            'activity_types': [{'id': slug(a), 'name': a} for a in db.activity_types],
            'snapshot': SNAPSHOT, 'synthetic': True, 'advisor_mode': 'dataset'}


@lru_cache(maxsize=1)
def get_data():
    return Dataset()
