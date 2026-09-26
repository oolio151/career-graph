"""First-job summaries for the Discover map."""
from collections import Counter, defaultdict

def discover_map(dataset, campus_id, filters):
    result = dataset.discover(campus_id, filters)
    student = dataset.students[campus_id]
    groups = defaultdict(list)
    for alum in dataset.alumni:
        if alum["major"] != student["major"] or alum["degree_level"] != "Bachelor of Science":
            continue
        if filters.get("track") and alum["track"] != student["track"]:
            continue
        if filters.get("gpa") and abs(float(alum["final_gpa"]) - float(student["cumulative_gpa"])) > .250001:
            continue
        if filters.get("internships") and min(int(alum["internship_count"]), 2) != min(int(student["internship_count"]), 2):
            continue
        if alum["first_destination"] in {"Employed Full-Time", "Employed Part-Time"}:
            groups[alum["first_job_title"]].append(alum)
    jobs = []
    for title, members in sorted(groups.items(), key=lambda item: (-len(item[1]), item[0])):
        routes, skills, next_roles = Counter(), Counter(), Counter()
        for alum in members:
            route = alum["first_job_found_via"]
            routes[route if route != "Not Applicable" else "Not reported"] += 1
            history = dataset.jobs[alum["campus_id"]]
            if history:
                skills.update(sorted(set(history[0]["role_skill_tags"].split("|")) - {"", "Not Applicable"}))
            if len(history) > 1:
                next_roles[history[1]["job_title"]] += 1
        progressed = sum(next_roles.values())
        jobs.append({"title": title, "count": len(members),
            "percent": round(100 * len(members) / result["employed_count"], 1),
            "routes": [{"name": name, "count": count, "percent": round(100 * count / len(members), 1)} for name, count in routes.most_common()],
            "skills": [name for name, count in skills.most_common()],
            "with_next_job": progressed,
            "next_roles": [{"title": name, "count": count, "percent": round(100 * count / progressed, 1)} for name, count in next_roles.most_common()]})
    result["first_jobs"] = jobs
    return result
