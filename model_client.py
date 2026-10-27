"""Chat Completions model adapter with structured tool calls."""
import json
from urllib.parse import urlsplit
from urllib.request import Request, build_opener
from network import NoRedirect, origin

class Model:
    """Adapter for the OpenAI-compatible Chat Completions tool-call interface."""
    def __init__(self, base_url, model, api_key='', temperature=0):
        origin(base_url)
        if urlsplit(base_url).query or urlsplit(base_url).fragment:
            raise ValueError('Model base URL must not contain query parameters or a fragment')
        self.url = base_url.rstrip('/') + '/chat/completions'
        self.model, self.api_key, self.temperature = model, api_key, temperature

    def complete(self, messages, tools):
        data = json.dumps(dict(model=self.model, messages=messages, tools=tools,
                               temperature=self.temperature)).encode()
        headers = {'Content-Type': 'application/json'}
        if self.api_key:
            headers['Authorization'] = 'Bearer ' + self.api_key
        request = Request(self.url, data=data, headers=headers)
        # Never forward an Authorization header across a redirect.
        with build_opener(NoRedirect).open(request, timeout=90) as response:
            raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError('Model response exceeds limit')
        return json.loads(raw)['choices'][0]['message']


