"""Explainable career pathways from the supplied CSV snapshot."""
import csv
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / 'data'


def tags(value):
    return set(value.split('|')) if value and value != 'Not Applicable' else set()


def prerequisite_gaps(value, completed):
    return [group for group in sorted(tags(value))
            if not set(group.split(' or ')) & completed]


class Pathways:
    def __init__(self, directory=DATA):
        def read(name):
            with (directory / f'{name}.csv').open(newline='', encoding='utf-8') as handle:
                return list(csv.DictReader(handle))
        self.students = {r['campus_id']: r for r in read('students_current')}
        self.alumni = {r['campus_id']: r for r in read('alumni')}
        self.courses = {r['course_id']: r for r in read('course_catalog')}
        self.transcripts = defaultdict(list)
        self.experiences = defaultdict(list)
        self.jobs = defaultdict(list)
        self.family_jobs = defaultdict(list)
        for row in read('transcripts'):
            self.transcripts[row['campus_id']].append(row)
        for row in read('student_experience'):
            self.experiences[row['campus_id']].append(row)
        for row in read('employment_history'):
            self.jobs[row['campus_id']].append(row)
            if row['seniority_level'] == 'Entry':
                self.family_jobs[row['job_family']].append(row)
        for jobs in self.jobs.values():
            jobs.sort(key=lambda row: row['start_date'])

    def options(self):
        return {'students': list(self.students.values()),
                'careers': sorted(self.family_jobs), 'snapshot': '2026-09-15'}

    def pathway(self, campus_id, career, season='Spring'):
        student = self.students[campus_id]
        jobs = self.family_jobs[career]
        frequency = Counter(skill for job in jobs for skill in tags(job['role_skill_tags']))
        completed = {r['course_id'] for r in self.transcripts[campus_id] if int(r['credits_earned']) > 0}
        progress = {r['course_id'] for r in self.transcripts[campus_id] if r['grade'] == 'IP'} - completed
        covered = set().union(*(tags(self.courses[c]['skill_tags']) for c in completed))
        pending = set().union(*(tags(self.courses[c]['skill_tags']) for c in progress))
        target = set(frequency)
        missing = target - covered
        skills = [{'name': name, 'count': count, 'percent': round(100 * count / len(jobs)),
                   'status': 'completed' if name in covered else 'progress' if name in pending else 'gap'}
                  for name, count in sorted(frequency.items(), key=lambda x: (-x[1], x[0]))]

        def course_info(course_id, status):
            course = self.courses[course_id]
            relevant = tags(course['skill_tags']) & target
            return {**course, 'status': status, 'skills': sorted(relevant),
                    'new_skills': sorted(relevant - covered),
                    'prerequisite_gaps': prerequisite_gaps(course['prerequisite_ids'], completed),
                    'offered': season in tags(course['typical_terms_offered'])}

        existing = [course_info(c, 'completed' if c in completed else 'progress')
                    for c in sorted(completed | progress) if tags(self.courses[c]['skill_tags']) & target]
        candidates = [course_info(c, 'suggested') for c in self.courses
                      if c not in completed | progress
                      and tags(self.courses[c]['skill_tags']) & (missing - pending)]
        eligible = [c for c in candidates if not c['prerequisite_gaps'] and c['offered']]
        suggestions = []
        remaining = missing - pending
        for _ in range(3):
            useful = [c for c in eligible if set(c['new_skills']) & remaining]
            if not useful:
                break
            best = min(useful, key=lambda c: (
                -sum(frequency[s] for s in set(c['new_skills']) & remaining),
                float(c['difficulty_index']), c['course_id']))
            suggestions.append(best)
            remaining -= set(best['new_skills'])
            eligible.remove(best)

        cohort = sorted({j['campus_id'] for j in jobs
                         if self.alumni[j['campus_id']]['major'] == student['major']
                         and self.alumni[j['campus_id']]['degree_level'] == 'Bachelor of Science'})
        activity_counts = Counter(activity for person in cohort
                                  for activity in {e['experience_type'] for e in self.experiences[person]})
        own_activities = Counter(e['experience_type'] for e in self.experiences[campus_id])
        activities = [{'name': name, 'count': count, 'percent': round(100 * count / len(cohort)),
                       'student_count': own_activities[name]}
                      for name, count in sorted(activity_counts.items(), key=lambda x: (-x[1], x[0]))]
        examples = []
        for person in cohort[:3]:
            alum = self.alumni[person]
            examples.append({'campus_id': person, 'track': alum['track'], 'year': alum['graduation_year'],
                             'activities': sorted({e['experience_type'] for e in self.experiences[person]}),
                             'jobs': [{'title': j['job_title'], 'family': j['job_family'],
                                       'start': j['start_date'], 'level': j['seniority_level']}
                                      for j in self.jobs[person]]})
        return {'student': student, 'career': career, 'season': season,
                'skills': skills, 'courses': existing, 'suggestions': suggestions,
                'blocked_courses': sorted([c for c in candidates if c['prerequisite_gaps'] or not c['offered']],
                                          key=lambda c: (-len(c['new_skills']), c['course_id']))[:5],
                'coverage': {'covered': len(target & covered), 'total': len(target),
                             'percent': round(100 * len(target & covered) / len(target)) if target else 0,
                             'in_progress': len((pending - covered) & target)},
                'job_count': len(jobs), 'cohort_count': len(cohort), 'activities': activities, 'examples': examples}


@lru_cache(maxsize=1)
def get_pathways():
    return Pathways()
