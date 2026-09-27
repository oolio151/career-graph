"""Minimal Google Gemini client for the resume advisor.

Standard library only, so the demo keeps its two dependencies. The API key is
read from the server environment and never reaches the browser.
"""
import json
import urllib.error
import urllib.request

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_MODEL = "gemini-2.5-flash"
TIMEOUT = 30
# Gemini 3 reasons by default and its thinking tokens are drawn from the same
# maxOutputTokens budget, so a small cap silently truncates the visible reply.
MAX_OUTPUT_TOKENS = 2048
TRUNCATION_NOTICE = "(This reply reached the length limit and may be cut off. Ask a narrower question.)"


class GeminiError(RuntimeError):
    """Raised when Gemini cannot be reached or returns no usable text."""


class Gemini:
    def __init__(self, api_key, model=DEFAULT_MODEL, timeout=TIMEOUT):
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    @property
    def enabled(self):
        return bool(self.api_key)

    def generate(self, prompt, system_instruction=None):
        """Return assistant text for one prompt, or raise GeminiError."""
        if not self.api_key:
            raise GeminiError("No GEMINI_API_KEY is configured.")
        generation_config = {"temperature": 0.4, "maxOutputTokens": MAX_OUTPUT_TOKENS}
        if self.model.startswith("gemini-3"):
            # Lower reasoning leaves the output budget for the answer itself.
            # Older models reject thinkingLevel, so only send it to Gemini 3.
            generation_config["thinkingConfig"] = {"thinkingLevel": "low"}
        request_body = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": generation_config,
        }
        if system_instruction:
            request_body["systemInstruction"] = {"parts": [{"text": system_instruction}]}
        request = urllib.request.Request(
            ENDPOINT.format(model=self.model),
            data=json.dumps(request_body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": self.api_key,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            # Gemini puts the useful quota/billing diagnosis in the JSON body.
            # Preserve that message without ever echoing the API key.
            detail = ""
            try:
                body = json.loads(error.read().decode("utf-8"))
                detail = ((body.get("error") or {}).get("message") or "").strip()
                reason = ((body.get("error") or {}).get("status") or "").strip()
                if reason and reason.lower() not in detail.lower():
                    detail = f"{reason}: {detail}" if detail else reason
            except (UnicodeDecodeError, ValueError, AttributeError):
                pass
            suffix = f": {detail}" if detail else ""
            raise GeminiError(f"Gemini returned HTTP {error.code}{suffix}") from None
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise GeminiError(f"Could not reach Gemini: {error}.") from None
        except (ValueError, KeyError):
            raise GeminiError("Gemini sent a response we could not read.") from None
        return self._first_text(payload)

    def _first_text(self, payload):
        blocked = payload.get("promptFeedback", {}).get("blockReason")
        if blocked:
            raise GeminiError(f"Gemini blocked the request: {blocked}.")
        candidates = payload.get("candidates") or []
        for candidate in candidates:
            for part in (candidate.get("content") or {}).get("parts") or []:
                text = (part.get("text") or "").strip()
                if text:
                    return self._note_truncation(text, candidate.get("finishReason"))
        raise GeminiError("Gemini returned no text.")

    def _note_truncation(self, text, finish_reason):
        """Never show a cut-off reply as if it were complete."""
        if finish_reason == "MAX_TOKENS" and TRUNCATION_NOTICE not in text:
            return f"{text}\n\n{TRUNCATION_NOTICE}"
        return text
