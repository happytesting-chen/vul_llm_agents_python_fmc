"""HTTP resource address handling."""
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def origin(url):
    p = urlsplit(url)
    if p.scheme not in ('http', 'https') or not p.hostname or p.username or p.password:
        raise ValueError('Expected an HTTP(S) URL without credentials')
    return f'{p.scheme}://{p.hostname}:{p.port or (443 if p.scheme == "https" else 80)}'


