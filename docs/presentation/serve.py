"""Local-only preview server with byte ranges for reliable MP4 seeking."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse
import re

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[1]
EXTRA={ROOT/'web/src/style.css',ROOT/'web/public/logo-mark.png'}
EXTENSIONS={'.html','.css','.js','.png','.jpg','.mp4','.ttf','.json'}

class PlayerHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        path=(ROOT/unquote(urlsplit(self.path).path).lstrip('/')).resolve()
        if path==HERE: path=HERE/'index.html'
        if (not path.is_relative_to(HERE) and path not in EXTRA) or path.suffix not in EXTENSIONS or not path.is_file():
            self.send_error(404)
            return None
        size=path.stat().st_size
        start,end=0,size-1
        request=self.headers.get('Range')
        if request:
            match=re.fullmatch(r'bytes=(\d*)-(\d*)',request)
            if not match or not any(match.groups()):
                self.send_error(416)
                return None
            lo,hi=match.groups()
            if lo:
                start=int(lo);end=min(int(hi),size-1) if hi else size-1
            else:
                start=max(0,size-int(hi))
            if start>=size or start>end:
                self.send_response(416)
                self.send_header('Content-Range',f'bytes */{size}')
                self.end_headers()
                return None
        self.send_response(206 if request else 200)
        self.send_header('Content-Type',self.guess_type(str(path)))
        self.send_header('Accept-Ranges','bytes')
        self.send_header('Content-Length',str(end-start+1))
        self.send_header('Cache-Control','no-cache')
        if request: self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
        self.end_headers()
        self.remaining=end-start+1
        stream=path.open('rb');stream.seek(start)
        return stream

    def copyfile(self,source,output):
        try:
            while self.remaining>0:
                chunk=source.read(min(65536,self.remaining))
                if not chunk: break
                output.write(chunk)
                self.remaining-=len(chunk)
        except (BrokenPipeError,ConnectionResetError):
            pass  # Browsers cancel a previous range when seeking.

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=5184)
    args=parser.parse_args()
    print(f'http://127.0.0.1:{args.port}/docs/presentation/index.html',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),PlayerHandler).serve_forever()
