"""Extract resume text without retaining uploads or sending files to a provider."""
from io import BytesIO
from pathlib import PurePath
import re
from xml.etree import ElementTree
from zipfile import BadZipFile, ZipFile

MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_RESUME_CHARS = 16000


class ResumeInputError(ValueError):
    """An intentional, user-facing document limitation."""


def validate_text(text):
    if not isinstance(text, str):
        raise ValueError('Resume text must be text.')
    text = '\n'.join(text.replace('\x00', '').splitlines()).strip()
    if len(text) < 80:
        raise ValueError('Add at least 80 characters of readable resume text. Scanned PDFs need OCR first; you can paste text instead.')
    if len(text) > MAX_RESUME_CHARS:
        raise ValueError('Keep your resume under 16,000 characters. Shorten the text or upload a shorter document.')
    return text


def extract_resume(upload):
    extension = PurePath(upload.filename or '').suffix.lower()
    if extension not in {'.pdf', '.docx', '.txt'}:
        raise ValueError('Choose a PDF, DOCX, or UTF-8 TXT resume.')
    data = upload.stream.read(MAX_FILE_BYTES + 1)
    if not data or len(data) > MAX_FILE_BYTES:
        raise ValueError('Choose a nonempty resume smaller than 2 MB.')
    if extension == '.txt':
        try:
            text = data.decode('utf-8-sig')
        except UnicodeDecodeError:
            raise ValueError('Save the text file as UTF-8, or paste your resume text.') from None
    elif extension == '.docx':
        try:
            with ZipFile(BytesIO(data)) as archive:
                document = archive.getinfo('word/document.xml')
                if document.file_size > 2 * 1024 * 1024:
                    raise ValueError('The DOCX text is too large. Paste a shorter version instead.')
                xml = archive.read(document)
                if re.search(br'<!\s*(?:DOCTYPE|ENTITY)', xml, re.IGNORECASE):
                    raise ValueError('This DOCX cannot be processed. Export it as a PDF or plain text.')
                root = ElementTree.fromstring(xml)
                namespace = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
                text = '\n'.join(''.join(node.text or '' for node in paragraph.iter(namespace + 't'))
                                 for paragraph in root.iter(namespace + 'p'))
        except (BadZipFile, KeyError, ElementTree.ParseError, RuntimeError, NotImplementedError):
            raise ValueError('This DOCX could not be read. Export it as PDF or paste its text.') from None
    else:
        if not data.startswith(b'%PDF-'):
            raise ValueError('This file is not a readable PDF. Export the resume again or paste its text.')
        try:
            from pypdf import PdfReader
        except ImportError:
            raise ValueError('PDF support is not installed on the server yet. Paste text or install requirements.txt.') from None
        try:
            reader = PdfReader(BytesIO(data))
            if reader.is_encrypted:
                raise ResumeInputError('Upload an unencrypted PDF or paste the resume text.')
            if len(reader.pages) > 5:
                raise ResumeInputError('Use a resume with at most five pages.')
            pages = []
            for page in reader.pages:
                content = page.get_contents()
                if content and len(content.get_data()) > 10 * 1024 * 1024:
                    raise ResumeInputError('This PDF is too complex. Export a simpler PDF or paste its text.')
                pages.append(page.extract_text() or '')
            text = '\n'.join(pages)
        except ResumeInputError:
            raise
        except Exception:
            # Never echo document content or parser exception details.
            raise ValueError('This PDF could not be read. Export it again or paste its text.') from None
    return validate_text(text)
