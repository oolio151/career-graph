from flask import Flask, render_template


def create_app():
    app = Flask(__name__)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/health")
    def health():
        return {"status": "ok", "app": "career-graph"}

    return app
