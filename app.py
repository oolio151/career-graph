from flask import Flask, render_template
from python.api import api


def create_app():
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = 32 * 1024
    app.register_blueprint(api)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/health")
    def health():
        return {"status": "ok", "app": "career-graph"}

    return app
