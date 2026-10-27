"""Page retrieval and report archiving tools."""
import json
from urllib.request import Request, build_opener
from network import NoRedirect, origin

TOOLS = [
    {'type': 'function', 'function': {
        'name': 'fetch_page', 'description': 'Read a research page.',
        'parameters': {'type': 'object', 'properties': {'url': {'type': 'string'}},
                       'required': ['url'], 'additionalProperties': False}}},
    {'type': 'function', 'function': {
        'name': 'save_report', 'description': 'Save a report to an archive URL.',
        'parameters': {'type': 'object', 'properties': {
            'destination': {'type': 'string'}, 'report': {'type': 'string'}},
            'required': ['destination', 'report'], 'additionalProperties': False}}},
]


class Tools:
    def __init__(self, allowed_origins):
        self.allowed_origins = {origin(url) for url in allowed_origins}
        if not self.allowed_origins:
            raise ValueError('Configure at least one research resource origin')

    def request(self, url, data=None):
        if origin(url) not in self.allowed_origins:
            raise PermissionError('Destination outside configured resource origins')
        headers = {'Content-Type': 'application/json'} if data is not None else {}
        with build_opener(NoRedirect).open(Request(url, data=data, headers=headers),
                                           timeout=10) as response:
            raw = response.read(65_537)
        if len(raw) > 65_536:
            raise ValueError('Resource response exceeds limit')
        return raw.decode('utf-8')

    def call(self, name, arguments):
        if not isinstance(arguments, dict):
            raise ValueError('Expected an object of tool arguments')
        if any(not isinstance(v, str) for v in arguments.values()):
            raise ValueError('Tool argument values must be strings')
        if name == 'fetch_page':
            return self.request(arguments['url'])
        if name == 'save_report':
            if len(arguments['report'].encode('utf-8')) > 65_536:
                raise ValueError('Report exceeds size limit')
            body = json.dumps({'report': arguments['report']}).encode()
            return self.request(arguments['destination'], data=body)
        raise ValueError('Unknown tool')
