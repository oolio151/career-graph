"""Line-addressed resume proposals for LaTeX source and legacy PDF drafts."""
import json
import os
import re
import shutil
import subprocess
import tempfile
from threading import Lock
from difflib import SequenceMatcher
from io import BytesIO
from xml.sax.saxutils import escape
from pathlib import Path

import reportlab
from pypdf import PdfReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.pdfgen import canvas

from career_data import SYSTEM_INSTRUCTION
from gemini import GeminiError

_fonts = Path(reportlab.__file__).parent / 'fonts'
pdfmetrics.registerFont(TTFont('Resume', str(_fonts / 'Vera.ttf')))
pdfmetrics.registerFont(TTFont('ResumeBold', str(_fonts / 'VeraBd.ttf')))

_PROJECT = Path(__file__).resolve().parent.parent
_LATEX_BUNDLE = _PROJECT / 'vendor/latex'
_cache_lock = Lock()


def _latex_cache():
    if os.environ.get('VERCEL') != '1':
        return _PROJECT / 'instance/cache'
    # Deployment files are read-only. Seed a writable cache once per instance.
    cache = Path(tempfile.gettempdir()) / 'grit-latex-cache-v1'
    with _cache_lock:
        marker = cache / '.ready'
        if not marker.exists():
            cache.mkdir(parents=True, exist_ok=True)
            seed = _LATEX_BUNDLE / 'cache'
            if seed.is_dir():
                shutil.copytree(seed, cache, dirs_exist_ok=True)
            marker.touch()
    return cache


def extract_latex(data):
    """Decode a LaTeX resume into editable source lines."""
    try:
        text = data.decode('utf-8-sig')
    except UnicodeDecodeError:
        raise ValueError('This LaTeX file is not valid UTF-8.') from None
    if not text.strip():
        raise ValueError('The LaTeX resume is empty.')
    if len(text) > 20000 or len(text.splitlines()) > 350:
        raise ValueError('Use a LaTeX resume of up to 350 lines and 20,000 characters.')
    if '\\documentclass' not in text or '\\begin{document}' not in text:
        raise ValueError('Upload a complete LaTeX resume with documentclass and begin{document}.')
    return text


def apply_latex_lines(lines):
    """Serialize validated source lines without changing LaTeX formatting."""
    validate_lines(lines)
    return ('\n'.join(lines) + '\n').encode('utf-8')


def compile_latex(data):
    """Compile a LaTeX source buffer into a PDF in an isolated temp directory."""
    source = extract_latex(data)
    local = _PROJECT / 'instance/bin/tectonic'
    bundled = _LATEX_BUNDLE / 'tectonic'
    compiler = (os.environ.get('LATEX_COMPILER', '').strip() or
                (str(bundled) if bundled.is_file() else None) or
                (str(local) if local.is_file() else None) or shutil.which('tectonic') or shutil.which('pdflatex'))
    if not compiler:
        raise RuntimeError('LaTeX preview is unavailable because no tectonic or pdflatex compiler is installed.')
    with tempfile.TemporaryDirectory(prefix='grit-latex-') as directory:
        root = Path(directory)
        tex = root / 'resume.tex'
        tex.write_text(source, encoding='utf-8')
        if Path(compiler).name == 'tectonic':
            command = [compiler, '--untrusted', '--outdir', str(root), str(tex)]
        else:
            command = [compiler, '-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape',
                       '-output-directory', str(root), str(tex)]
        try:
            env = {**os.environ, 'openin_any': 'p', 'openout_any': 'p',
                   'XDG_CACHE_HOME': str(_latex_cache())}
            result = subprocess.run(command, cwd=root, env=env, capture_output=True, timeout=90, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise RuntimeError('LaTeX preview timed out or could not start.') from None
        pdf = root / 'resume.pdf'
        if result.returncode or not pdf.exists() or pdf.stat().st_size > 10 * 1024 * 1024:
            detail = (result.stdout + result.stderr).decode('utf-8', 'replace')[-500:]
            raise RuntimeError('LaTeX could not compile this resume.' + (f' {detail}' if detail else ''))
        return BytesIO(pdf.read_bytes())


def extract_pdf(data):
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            raise ValueError('Upload an unencrypted PDF.')
        if len(reader.pages) > 5:
            raise ValueError('Use a resume of five pages or fewer.')
        text = '\n'.join(page.extract_text() or '' for page in reader.pages)
    except ValueError:
        raise
    except Exception:
        raise ValueError('This PDF could not be read. Export a new text-based PDF.') from None
    if not text.strip():
        raise ValueError('This PDF has no selectable text. Export a text-based PDF; scanned images need OCR first.')
    return text


def validate_lines(lines):
    if (not isinstance(lines, list) or not 1 <= len(lines) <= 350
            or not all(isinstance(line, str) and len(line) <= 2000 for line in lines)
            or sum(map(len, lines)) > 20000 or not any(line.strip() for line in lines)):
        raise ValueError('Use a readable resume of up to 350 lines and 20,000 characters.')
    return lines


def _match_edit_line(lines, number, before):
    """Recover numbering/edge-whitespace drift without fuzzy matching LaTeX content."""
    if isinstance(number, str) and number.isascii() and number.isdecimal():
        number = int(number)
    if type(number) is not int or not isinstance(before, str):
        raise ValueError()
    if 1 <= number <= len(lines) and before == lines[number - 1]:
        return number
    # Never relocate blank lines or guess between repeated source lines.
    if not before.strip():
        raise ValueError()
    matches = [i + 1 for i, line in enumerate(lines) if line == before]
    if not matches:
        matches = [i + 1 for i, line in enumerate(lines) if line.strip() == before.strip()]
    if len(matches) != 1:
        raise ValueError()
    return matches[0]


def propose_edits(dataset, campus_id, lines, question, history, gemini, target_role=''):
    validate_lines(lines)
    if not isinstance(question, str) or not question.strip() or len(question) > 1000:
        raise ValueError('Ask a question using 1–1,000 characters.')
    if not gemini.enabled:
        raise GeminiError('Configure Gemini to discuss and propose resume edits.')
    if not isinstance(target_role, str) or len(target_role) > 160:
        raise ValueError('Choose a target role shorter than 160 characters.')
    instruction = SYSTEM_INSTRUCTION + '''
For this resume editing workspace, override the plain-text response format and suggestion
marker with JSON only: {"reply": "conversational answer or follow-up question", "edits":
[{"line": 1, "before": "exact current line", "after": "replacement line", "reason": "why"}]}.
Return plain text and line numbers only. Never return PDF data, PDF operators, bytecode,
HTML, Markdown fences, or a replacement document. The current lines are LaTeX source;
preserve commands and edit only the requested content unless a source command change is
explicitly requested.
Use the optional target role as background when it helps focus resume advice. Do not force it
into unrelated replies. Use at most three edits per turn. Most discussion or clarification turns need edits: [].
When the request is broad, identify a concrete section and ask one or two focused questions
about the student's actual contribution, tools, or results. Don't invent metrics. Refer to
line numbers when useful. Only propose edits relevant to the student's request. Clarify
ambiguous references. Use details explicitly confirmed in recent conversation, but never
copy synthetic student or alumni achievements into an actual resume. Do not use the old
SUGGESTED RESUME LINE marker. The numbered current_lines are the authoritative current draft.
Each edit replaces exactly one complete line; before must match it exactly. You can replace
a line with multiple newline-separated lines to expand it, or an empty string to remove it.
Copy line numbers and before text from current_lines, not recent_conversation. Preserve
indentation and correctly JSON-escape LaTeX backslashes. Never combine multiple source lines
in before, even when they form one sentence or bullet.
Never suggest a new name or contact details unless explicitly requested. No edits are applied
until the student approves them. Previous proposals in history are not proof of acceptance.
'''
    context = {'background': dataset.resume_context(campus_id, 'See current_lines for the resume source.'),
               'current_lines': [{'line': i + 1, 'text': line} for i, line in enumerate(lines)],
               'recent_conversation': history, 'question': question, 'target_role': target_role}
    raw = gemini.generate(json.dumps(context, ensure_ascii=False), instruction, json_mode=True)
    try:
        parsed = json.loads(re.sub(r'^```(?:json)?\s*|\s*```$', '', raw.strip()))
        reply, edits = parsed['reply'], parsed['edits']
        if not isinstance(reply, str) or not reply.strip() or len(reply) > 6000 or not isinstance(edits, list) or len(edits) > 3:
            raise ValueError()
        seen = set()
        for edit in edits:
            number = _match_edit_line(lines, edit['line'], edit['before'])
            if (number in seen
                    or not isinstance(edit['after'], str) or len(edit['after']) > 2000
                    or not isinstance(edit['reason'], str) or len(edit['reason']) > 1000):
                raise ValueError()
            edit['line'] = number
            edit['before'] = lines[number - 1]
            seen.add(number)
    except (ValueError, KeyError, TypeError):
        raise GeminiError('Gemini returned an edit that could not be matched to the draft. Please try again.') from None
    return {'reply': reply, 'edits': edits, 'model': gemini.model}


def make_pdf(lines, changed=()):
    validate_lines(lines)
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=letter, leftMargin=46, rightMargin=46,
                            topMargin=42, bottomMargin=42, title='Resume draft', author='')
    story = []
    if changed:
        story.append(Paragraph('CHANGE REVIEW — highlighted lines are revised', ParagraphStyle('note', fontSize=8, spaceAfter=16)))
    section_names = {'education', 'experience', 'work experience', 'projects', 'skills', 'technical skills',
                     'summary', 'professional summary', 'leadership', 'certifications', 'research', 'activities'}
    for i, line in enumerate(lines):
        if not line.strip():
            if i in changed:
                story.append(Paragraph(f'Line {i + 1} removed', ParagraphStyle('removed', fontName='Resume',
                    fontSize=9, leading=13, spaceAfter=5, backColor=colors.HexColor('#ffe3dc'))))
            else:
                story.append(Spacer(1, 7))
            continue
        heading = line.strip().rstrip(':').lower() in section_names
        style = ParagraphStyle('line', fontName='ResumeBold' if i == 0 or heading else 'Resume',
                               fontSize=19 if i == 0 else (12 if heading else 10),
                               leading=23 if i == 0 else 14, spaceBefore=9 if heading else 0,
                               spaceAfter=5, backColor=colors.HexColor('#fff1b8') if i in changed else None)
        safe = escape(line).replace('\n', '<br/>')
        story.append(Paragraph(safe, style))
    doc.build(story)
    output.seek(0)
    return output


def _line_positions(reader):
    """Collect approximate text baselines in PDF reading order."""
    positions = []
    for page_number, page in enumerate(reader.pages):
        chunks = []
        def visitor(text, cm, tm, font_dict, font_size):
            value = (text or '').replace('\n', '').strip()
            if value:
                # pypdf's text matrix can contain line-local offsets; the
                # current transformation matrix carries the page coordinates.
                chunks.append((round(float(cm[5]), 1), round(float(cm[4]), 1), value, font_size))
        try:
            page.extract_text(visitor_text=visitor)
        except Exception:
            chunks = []
        for y, x, text, font_size in sorted(chunks, key=lambda item: (-item[0], item[1])):
            if positions and positions[-1][0] == page_number and abs(positions[-1][2] - y) < 2:
                positions[-1] = (page_number, positions[-1][1], y,
                                 positions[-1][3] + text, positions[-1][4])
            else:
                positions.append((page_number, x, y, text, font_size))
    return positions


def _aligned_positions(original_lines, positions):
    """Map extracted lines to nearby visual lines, tolerating PDF reading-order noise."""
    if not positions:
        return [None] * len(original_lines)
    clean = lambda value: re.sub(r'[^a-z0-9]+', ' ', value.lower()).strip()
    visual = [clean(item[3]) for item in positions]
    mapping = [None] * len(original_lines)
    used = set()
    # Prefer exact and strong matches while maintaining a loose reading order.
    for index, line in enumerate(original_lines):
        needle = clean(line)
        if not needle:
            continue
        ranked = []
        for position, value in enumerate(visual):
            if position in used or not value:
                continue
            similarity = SequenceMatcher(None, needle, value).ratio()
            if needle in value or value in needle:
                similarity = max(similarity, .9)
            distance = abs(position - round(index * len(positions) / max(1, len(original_lines))))
            ranked.append((similarity - min(distance, 20) * .002, position))
        if ranked:
            score, position = max(ranked)
            if score >= .45:
                mapping[index] = positions[position]
                used.add(position)
    # Fill gaps from the nearest known line, preserving its page and typography.
    known = [i for i, value in enumerate(mapping) if value]
    for index in range(len(mapping)):
        if mapping[index] or not known:
            continue
        nearest = min(known, key=lambda item: abs(item - index))
        mapping[index] = mapping[nearest]
    return mapping


def preserve_pdf(original_bytes, original_lines, new_lines):
    """Overlay changed text on the original PDF, preserving its layout and styling."""
    validate_lines(new_lines)
    original_lines = validate_lines(original_lines)
    reader = PdfReader(BytesIO(original_bytes))
    changed_lines = [(i, before, after) for i, (before, after) in enumerate(zip(original_lines, new_lines))
                     if before != after]
    if not changed_lines:
        output = BytesIO(original_bytes)
        output.seek(0)
        return output
    if len(new_lines) < len(original_lines):
        new_lines = [*new_lines, *([''] * (len(original_lines) - len(new_lines)))]
    positions = _line_positions(reader)
    by_line = _aligned_positions(original_lines, positions)
    # Some PDFs flatten all text into one stream with no usable coordinates
    # (common with exported multi-column resumes). Never guess in that case.
    if len(positions) < max(3, len(original_lines) * .35) or any(
            item[1] == 0 and item[2] == 0 for item in positions):
        return append_edit_page(original_bytes, changed_lines)
    overlays = [BytesIO() for _ in reader.pages]
    canvases = [canvas.Canvas(stream, pagesize=(float(page.mediabox.width), float(page.mediabox.height)))
                for stream, page in zip(overlays, reader.pages)]
    for index, (before, after) in enumerate(zip(original_lines, new_lines)):
        if before == after:
            continue
        needle = re.sub(r'\s+', ' ', before).strip().lower()
        if not needle:
            continue
        visual = by_line[index] if index < len(by_line) else None
        if not visual:
            continue
        page_number, x, y, _, font_size = visual
        page = reader.pages[page_number]
        width = float(page.mediabox.width)
        size = max(7, min(float(font_size or 10), 18))
        canvases[page_number].setFillColor(colors.white)
        canvases[page_number].rect(max(0, x - 2), max(0, y - size * .35), width - x - 8,
                                   size * 1.45, fill=1, stroke=0)
        if after:
            canvases[page_number].setFillColor(colors.black)
            canvases[page_number].setFont('Resume', size)
            canvases[page_number].drawString(x, y, after.replace('\n', ' '))
    for item in canvases:
        item.save()
    for page_number, page in enumerate(reader.pages):
        overlay = PdfReader(overlays[page_number]).pages[0]
        page.merge_page(overlay)
    output = BytesIO()
    from pypdf import PdfWriter
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.write(output)
    output.seek(0)
    return output


def append_edit_page(original_bytes, changed_lines):
    """Keep the original pages untouched and add a clearly labeled edit appendix."""
    appendix = BytesIO()
    doc = SimpleDocTemplate(appendix, pagesize=letter, leftMargin=48, rightMargin=48,
                            topMargin=48, bottomMargin=48, title='Resume edit review')
    heading = ParagraphStyle('appendix-heading', fontName='ResumeBold', fontSize=18,
                             leading=23, spaceAfter=18)
    label = ParagraphStyle('appendix-label', fontName='ResumeBold', fontSize=9,
                           leading=12, textColor=colors.HexColor('#5d684e'), spaceBefore=12)
    body = ParagraphStyle('appendix-body', fontName='Resume', fontSize=10,
                          leading=14, spaceAfter=5)
    story = [Paragraph('Resume edit review', heading),
             Paragraph('The original PDF layout could not be safely edited in place. The original pages are preserved above; proposed replacements are listed here for review and manual transfer.', body)]
    for number, before, after in changed_lines:
        story.extend([Paragraph(f'Line {number + 1} · Current', label),
                      Paragraph(escape(before) or '(blank)', body),
                      Paragraph('Proposed', label),
                      Paragraph(escape(after) or '(remove this line)', body)])
    doc.build(story)
    appendix.seek(0)
    from pypdf import PdfWriter
    writer = PdfWriter()
    original = PdfReader(BytesIO(original_bytes))
    for page in original.pages:
        writer.add_page(page)
    for page in PdfReader(appendix).pages:
        writer.add_page(page)
    output = BytesIO()
    writer.write(output)
    output.seek(0)
    return output
