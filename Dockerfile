FROM python:3.12-slim
WORKDIR /app
COPY agent.py tools.py model_client.py network.py events.py requirements.txt ./
USER 65532:65532
ENTRYPOINT ["python", "agent.py"]
