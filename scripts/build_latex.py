"""Bundle a pinned standalone compiler and warm its packages during Vercel build."""
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile
import tempfile
from urllib.request import urlopen

VERSION = '0.17.0'
URL = ('https://github.com/tectonic-typesetting/tectonic/releases/download/'
       f'tectonic%40{VERSION}/tectonic-{VERSION}-x86_64-unknown-linux-musl.tar.gz')
DEST = Path(__file__).resolve().parents[1] / 'vendor/latex'
SAMPLE = r"""\documentclass[11pt]{article}
\usepackage[margin=0.7in]{geometry}
\usepackage[T1]{fontenc}
\usepackage{lmodern,xcolor,titlesec,enumitem,hyperref,tabularx,fancyhdr,ragged2e,multicol}
\definecolor{headercolor}{RGB}{173,100,82}
\titleformat{\section}{\large\bfseries\color{headercolor}}{}{0em}{}
\begin{document}
\section*{Preview build check}
\begin{itemize}[leftmargin=*]
\item A resume with colored headings and formatted bullets.
\end{itemize}
\href{mailto:example@example.com}{Email}
\end{document}
"""


def main():
    if platform.system() != 'Linux' or platform.machine() not in ('x86_64', 'AMD64'):
        raise RuntimeError('This deployment bundle requires Linux x86_64.')
    DEST.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='latex-build-') as temp:
        root = Path(temp)
        archive = root / 'tectonic.tar.gz'
        print(f'Downloading Tectonic {VERSION}', flush=True)
        with urlopen(URL, timeout=120) as response, archive.open('wb') as output:
            shutil.copyfileobj(response, output)
        with tarfile.open(archive) as tar:
            member = next(m for m in tar.getmembers()
                          if Path(m.name).name == 'tectonic' and m.isfile())
            with tar.extractfile(member) as binary, (DEST / 'tectonic').open('wb') as output:
                shutil.copyfileobj(binary, output)
        (DEST / 'tectonic').chmod(0o755)
        source = root / 'preview.tex'
        source.write_text(SAMPLE, encoding='utf-8')
        print('Preloading LaTeX packages and verifying PDF compilation', flush=True)
        subprocess.run([str(DEST / 'tectonic'), '--untrusted', '--outdir', str(root), str(source)],
                       cwd=root, env={**os.environ, 'XDG_CACHE_HOME': str(DEST / 'cache')},
                       check=True, timeout=600)
        if not (root / 'preview.pdf').read_bytes().startswith(b'%PDF-'):
            raise RuntimeError('Compiler did not produce a PDF.')
    print('LaTeX deployment bundle ready', flush=True)


if __name__ == '__main__':
    main()
