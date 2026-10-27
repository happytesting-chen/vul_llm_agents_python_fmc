# Agent services

Node.js 24+ service collection. Run only in an isolated lab with synthetic data.

```bash
npm install
npm start
node src/index.js --only researchbot
```

The default bind address is 127.0.0.1. API services use /v1/chat/completions,
MCP services use JSON-RPC POST /, and A2A services use POST /a2a/message.
Ports and IDs are declared in src/core/agents.js. There is no dashboard.
Optional model configuration: AGENT_MODEL_PROVIDER, AGENT_MODEL_API_KEY,
AGENT_MODEL. Default responses are local; model support varies by service.
No telemetry client is included. No scanner, tests or challenge platform is included.

This is a source-assessment snapshot. Read implementation and configuration together.
Do not use real credentials. See LICENSE and NOTICE for attribution.
