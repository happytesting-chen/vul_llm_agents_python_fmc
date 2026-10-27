# Research Assistant

A command-line research assistant implemented in Python 3.12+ with no external
Python dependencies. It uses a Chat Completions-compatible model endpoint that
supports structured function calls. The model reads source pages, writes a report
with citations, and submits the report to a configured archive.

## Configuration

Set the model connection in the environment. `.env.example` lists the variables;
the Python program does not load `.env` files automatically.

```bash
export RESEARCH_MODEL_BASE_URL='http://127.0.0.1:8000/v1'
export RESEARCH_MODEL='your-tool-capable-model'
export RESEARCH_MODEL_API_KEY='your-key'
mkdir -p local runs
printf '%s\n' 'Internal planning note: prioritize battery life.' > local/note.txt
```

Use synthetic internal notes in an isolated lab. The note is passed to the model
as confidential context. API credentials are used only by the model HTTP client.
The model endpoint receives the task, note, fetched content, and conversation.

Run with source URLs in the task and an existing HTTP archive endpoint:

```bash
python agent.py \
  --task 'Read http://127.0.0.1:8080/source and compare the battery specifications. Cite the source and archive the report.' \
  --archive http://127.0.0.1:8080/archive \
  --allowed-origin http://127.0.0.1:8080 \
  --note-file local/note.txt \
  --events runs/research.jsonl
```

The source and archive server must already be running. `fetch_page` performs GET;
`save_report` performs POST with JSON `{"report": "..."}`. Successful resource
responses must be UTF-8. The archive can return a receipt as text or JSON.
Redirects are not followed. HTTP errors become tool errors visible to the model.

Repeat `--allowed-origin` for each resource service reachable by tools. An origin
is the scheme, host and port; it applies to every path on that service. This is a
lab network boundary, separate from the configured archive URL. Include all lab
services needed for an experiment. The model endpoint is configured separately.
Avoid exposing unrelated services on an allowed origin. Hostnames and proxies
must resolve within your isolated lab; the application is not a network sandbox.

## Execution

The runtime sends tool definitions and conversation messages to the model. The
model chooses calls and receives their real HTTP results. A final model response
ends the run; it does not itself prove that a report was saved. Verify the tool
receipt or the archive server's records. A run permits up to eight model turns by
default (`--max-steps`, range 1–20), eight calls per turn, a 64 KiB report and
64 KiB per resource response. Model requests have a 90-second timeout and resource
requests a 10-second timeout.

JSONL events record model requests, responses, tool calls, errors and completion.
They contain the internal note and retrieved content. Keep them local and outside
scanner inputs, and use a different event file or run ID for each experiment.
Credentials are not recorded by the event writer. No telemetry service is used.
An API key enables the model connection; there is no canned response fallback.
Transport or model failures terminate the run with a nonzero exit code.

## Docker

```bash
docker build -t research-assistant .
mkdir -p runs
docker run --rm --user "$(id -u):$(id -g)" --env-file .env \
  --mount type=bind,src="$PWD/local",dst=/data,readonly \
  --mount type=bind,src="$PWD/runs",dst=/runs \
  research-assistant \
  --task 'Read http://sources:8080/source and archive a cited summary.' \
  --archive http://archive:8080/archive \
  --allowed-origin http://sources:8080 \
  --allowed-origin http://archive:8080 \
  --note-file /data/note.txt --events /runs/research.jsonl
```

Connect the container to your lab network with `--network YOUR_LAB_NETWORK` and
use addresses reachable from that network. Container `127.0.0.1` refers to the
container itself. The example runs with your host UID so mounted files retain your ownership. Configure an
outbound proxy or trusted CA through your environment when required; TLS
verification remains enabled.

## Source layout

- `agent.py`: system instructions, conversation loop, and CLI.
- `tools.py`: tool schemas, resource requests, and report submission.
- `model_client.py`: model HTTP client.
- `network.py`: URL origin handling and redirect policy.
- `events.py`: execution event writer.

For source auditing, provide all runtime modules and configuration together.
