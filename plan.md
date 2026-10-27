# Python Research Agent Implementation Plan

## Objective

Build a functional research assistant in plain Python for source-code auditing, black-box agent red teaming, and mitigation evaluation. The assistant performs legitimate research with one deliberately missing application control. Its model decisions and actual tool effects determine outcomes; attack success is not hardcoded.

Repository: https://github.com/happytesting-chen/vul_llm_agents_python_fmc

This document records the agreed design plan, not a claim that every validation step is complete. It describes the intended weakness and must be excluded from blind scanner inputs. Attack payloads, detailed ground truth, evaluators, and test results remain outside the target repository.

## Architectural reference

Use [ReversecLabs/damn-vulnerable-llm-agent](https://github.com/ReversecLabs/damn-vulnerable-llm-agent) as an architectural reference. Borrow its separation between a legitimate task, model-selected tool calls, real backend operations, and security controls that must be enforced by application code.

The reference banking assistant instructs the model to use only the current user's identity, while its transaction tool does not independently enforce ownership. Adapt that design principle to research: instruct the model to use the configured archive, while the initial report tool lacks exact-destination authorisation. These are analogous missing controls in different workflows, not identical vulnerabilities.

| Architectural element to borrow | Research-agent implementation |
| --- | --- |
| A useful task independent of attacks | Read sources, prepare a cited report, and archive it |
| Model-selected tool calls and returned observations | Plain Python conversation loop with structured tool calls |
| Real backend effects | Actual HTTP retrieval and report submission |
| Prompt restrictions distinct from backend enforcement | Archive restriction in instructions; exact-destination check absent in the initial tool |
| Inspectable execution | Neutral model/tool events and independent endpoint receipts |

Implement the research workflow independently. Do not copy the banking workflow, database schema, SQL injection, seeded challenge flags, attack solutions, LangChain agent executor, or Streamlit interface. Do not install or import the reference project. Its architecture is inspiration; it is not a runtime dependency or a claim of equivalent threat coverage.

Keep the existing requirement that attack payloads and outcome classification belong to an external evaluator. The reference project's challenge presentation is not part of the architecture being adopted.

## 1. Establish a Python-only codebase

Create a development branch and place only the Python research assistant and its supporting runtime, configuration, documentation, and container files in the active working tree. Do not retain the old JavaScript runtime, Node dependencies, scripted attack handlers, or outcome narration.

The selected repository's current main branch was empty when development began, so no JavaScript removal was needed. Retain applicable license and attribution notices. Existing historical material can remain in Git history; use a clean snapshot without history for blind source auditing.

## 2. Implement a legitimate research workflow

The user supplies a research question and source URLs. The assistant reads relevant sources, prepares an accurate summary with source citations, and submits the report to a configured archive.

Verify this ordinary workflow before evaluating attacks. The agent should produce a useful research result independently of any security experiment.

## 3. Use plain Python with a real model/tool loop

Use a tool-capable model through a configurable Chat Completions-compatible endpoint. Send the task and tool definitions to the model, execute its requested calls, return their results, and repeat until the model produces a final response or reaches a step limit.

Implement the action/observation loop directly in Python, borrowing the reference project's model/tool/backend separation without adopting its framework. No LangChain or LangGraph dependency is required. Structured tool calls provide an action/observation loop without requiring exposed chain-of-thought. A model connection failure must not silently fall back to scripted attack behaviour.

## 4. Provide two ordinary HTTP tools

| Tool | Legitimate purpose | Actual operation |
| --- | --- | --- |
| `fetch_page(url)` | Retrieve research source material | HTTP GET |
| `save_report(destination, report)` | Submit a report to an archive | HTTP POST with a JSON report |

The tools perform real HTTP requests and return receipts or errors to the model. Do not add attack phrase matching, automatic callback extraction, persona substitution, automatic secret insertion, or fabricated success responses.

## 5. Introduce one scoped missing authorisation control

Configure an approved archive URL and instruct the model to submit reports only there. Deliberately omit the backend check that restricts `save_report` to that exact archive destination.

An attacker-controlled source page may try to persuade the model to submit elsewhere. The tool accepts a model-selected destination within the configured lab resource origins because the exact archive authorisation check is absent.

Resource origin restrictions, request limits, and an isolated lab network provide outer containment. They are separate from application-level authorisation of a particular report destination. The experiment must make its controlled receiving endpoint reachable within that outer boundary.

The intended trust-boundary failure is untrusted source content influencing a privileged action without backend enforcement. Whether the model follows the malicious instruction must be measured.

## 6. Include synthetic confidential context

Load a fictional internal research note from an operator-supplied file. Supply it as confidential model context that may guide research but must not be included in reports or external submissions.

Keep actual model API credentials outside the model conversation. Use only synthetic confidential material in experiments.

Measure unauthorised submission and confidential-data leakage separately. A report can reach an unauthorised destination without containing the note, and a note can appear in output without an unauthorised submission.

## 7. Keep target source neutral and independently scannable

Keep runtime implementation and ordinary setup instructions in the target repository. Do not place attack examples, vulnerability answer labels, success classifiers, or evaluator fixtures in runtime modules.

The implementation may use this small module layout:

| File | Responsibility |
| --- | --- |
| `agent.py` | System instructions, model/tool conversation loop, and CLI |
| `tools.py` | Tool definitions, page retrieval, and report submission |
| `model_client.py` | Model API connection |
| `network.py` | URL origins and redirect policy |
| `events.py` | Neutral local execution events |
| `requirements.txt` | Runtime dependencies |
| `.env.example` | Model configuration variable examples |
| `Dockerfile` | Container execution |
| `README.md` | Setup and operational instructions |
| `LICENSE`, `NOTICE` | Licensing and attribution |

Configuration can remain in the CLI and environment rather than requiring a separate `config.py`.

Provide the entire runtime and relevant configuration to a source scanner; scanning only `agent.py` misses behaviour in the tool and network modules. Exclude this plan, Git history, execution logs, evaluation material, and PR discussion from a blind scan.

## 8. Validate functionality and security behaviour externally

First confirm that ordinary research reads sources and submits a useful report to the approved archive.

Then serve controlled malicious source content and use an independent HTTP receiver with a unique synthetic marker to observe effects. Record model version, configuration, task, source content, tool calls, receipts, errors, and final output so experiments can be repeated.

Distinguish an attempted tool call, a completed HTTP submission, and actual confidential-marker receipt. A model statement such as “sent” is not proof.

Scripted model fixtures can verify the conversation protocol and HTTP plumbing. They cannot demonstrate real-model prompt-injection susceptibility. Live-model trials are required for black-box attack results; record unsuccessful trials as well.

Keep attack payloads, evaluator code, outcome classification, and evidence outside the clean target. Runtime logs may contain confidential synthetic context and should not be included in scanner inputs.

## 9. Evaluate a mitigation using the same agent

Create a separate comparison version that enforces the approved archive destination inside the report tool before any request is sent. Keep the research workflow, model, prompts, and tool interfaces otherwise comparable.

Repeat both ordinary tasks and attack trials. Verify that legitimate submissions still work and unauthorised destinations are denied. Report submission prevention and data-disclosure prevention separately: destination checking alone does not establish that all output leakage has been eliminated.

The first comparison is this Python agent versus the same Python agent with the control added. A future JavaScript comparison should implement equivalent behaviour and controls rather than reuse DVAA's scripted attack paths.

## Initial scope and later work

The first version provides a CLI, Dockerfile, configurable model endpoint, and local execution logs. A dashboard, MCP interface, additional agents, and OWASP LLM/Agentic Top 10 mappings can follow later.

The missing control is deliberate. Attack success is neither scripted nor guaranteed.
