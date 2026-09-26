from flask import Flask, render_template, request

from python.pathways import get_pathways


def create_app():
    app = Flask(__name__)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/health")
    def health():
        return {"status": "ok", "app": "career-graph"}

    @app.get("/api/options")
    def options():
        return get_pathways().options()

    @app.get("/api/pathway")
    def pathway():
        data = get_pathways()
        student = request.args.get("student", "")
        career = request.args.get("career", "")
        season = request.args.get("season", "Spring")
        if student not in data.students:
            return {"error": "Choose a valid student."}, 400
        if career not in data.family_jobs:
            return {"error": "Choose a valid career."}, 400
        if season not in {"Spring", "Summer", "Fall"}:
            return {"error": "Choose a valid season."}, 400
        return data.pathway(student, career, season)

    return app
