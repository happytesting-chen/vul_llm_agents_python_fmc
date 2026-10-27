"""Chat Completions model adapter with structured tool calls."""
import json
import os
import ssl
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPSHandler
from network import NoRedirect, origin

def _make_opener():
    handlers = [NoRedirect]
    if os.getenv('AGENT_SSL_NO_VERIFY', '').lower() in ('1', 'true', 'yes'):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        handlers.append(HTTPSHandler(context=ctx))
    return build_opener(*handlers)


class Model:
    """Adapter for the OpenAI-compatible Chat Completions tool-call interface."""
    def __init__(self, base_url, model, api_key='', temperature=0, key_header='Authorization'):
        origin(base_url)
        if urlsplit(base_url).query or urlsplit(base_url).fragment:
            raise ValueError('Model base URL must not contain query parameters or a fragment')
        self.url = base_url.rstrip('/') + '/chat/completions'
        self.model, self.api_key, self.temperature = model, api_key, temperature
        self.key_header = key_header

    def complete(self, messages, tools):
        data = json.dumps(dict(model=self.model, messages=messages, tools=tools,
                               temperature=self.temperature)).encode()
        headers = {'Content-Type': 'application/json'}
        if self.api_key:
            headers[self.key_header] = (
                'Bearer ' + self.api_key if self.key_header == 'Authorization' else self.api_key
            )
        request = Request(self.url, data=data, headers=headers)
        with _make_opener().open(request, timeout=90) as response:
            raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError('Model response exceeds limit')
        return json.loads(raw)['choices'][0]['message']


class AnthropicModel:
    """Adapter for the Anthropic Messages API, presenting an OpenAI-compatible interface."""
    API_URL = 'https://api.anthropic.com/v1/messages'
    API_VERSION = '2023-06-01'

    def __init__(self, model, api_key, temperature=1):
        self.url = self.API_URL
        self.model, self.api_key, self.temperature = model, api_key, temperature

    def _convert_messages(self, messages):
        """Convert OpenAI message list to Anthropic format, returning (system, messages)."""
        system = None
        anthropic = []
        pending_tool_results = []

        for msg in messages:
            role = msg['role']
            if role == 'system':
                system = msg['content']
                continue

            if role == 'tool':
                pending_tool_results.append({
                    'type': 'tool_result',
                    'tool_use_id': msg['tool_call_id'],
                    'content': msg['content'],
                })
                continue

            # Flush buffered tool results as a single user message
            if pending_tool_results:
                anthropic.append({'role': 'user', 'content': pending_tool_results})
                pending_tool_results = []

            if role == 'assistant' and msg.get('tool_calls'):
                content = []
                if msg.get('content'):
                    content.append({'type': 'text', 'text': msg['content']})
                for tc in msg['tool_calls']:
                    content.append({
                        'type': 'tool_use',
                        'id': tc['id'],
                        'name': tc['function']['name'],
                        'input': json.loads(tc['function']['arguments']),
                    })
                anthropic.append({'role': 'assistant', 'content': content})
            else:
                anthropic.append({'role': role, 'content': msg['content']})

        if pending_tool_results:
            anthropic.append({'role': 'user', 'content': pending_tool_results})

        return system, anthropic

    def _convert_tools(self, tools):
        return [{
            'name': t['function']['name'],
            'description': t['function'].get('description', ''),
            'input_schema': t['function'].get('parameters', {'type': 'object', 'properties': {}}),
        } for t in tools]

    def complete(self, messages, tools):
        system, anthropic_messages = self._convert_messages(messages)
        body = {
            'model': self.model,
            'messages': anthropic_messages,
            'tools': self._convert_tools(tools),
            'max_tokens': 4096,
            'temperature': self.temperature,
        }
        if system:
            body['system'] = system

        data = json.dumps(body).encode()
        headers = {
            'Content-Type': 'application/json',
            'x-api-key': self.api_key,
            'anthropic-version': self.API_VERSION,
        }
        request = Request(self.url, data=data, headers=headers)
        with _make_opener().open(request, timeout=90) as response:
            raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError('Model response exceeds limit')

        result = json.loads(raw)
        content_blocks = result.get('content', [])
        text = ' '.join(b['text'] for b in content_blocks if b['type'] == 'text').strip() or None
        tool_uses = [b for b in content_blocks if b['type'] == 'tool_use']

        message = {'role': 'assistant', 'content': text}
        if tool_uses:
            message['tool_calls'] = [{
                'id': b['id'],
                'type': 'function',
                'function': {'name': b['name'], 'arguments': json.dumps(b['input'])},
            } for b in tool_uses]
        return message


def make_model(base_url, model, api_key='', temperature=0):
    """Return the right model adapter based on the base URL."""
    if 'anthropic.com' in base_url:
        return AnthropicModel(model, api_key, temperature=temperature)
    key_header = os.getenv('RESEARCH_MODEL_KEY_HEADER', 'Authorization')
    return Model(base_url, model, api_key, temperature, key_header=key_header)
