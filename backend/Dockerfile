FROM python:3.12-slim
RUN pip install uv
WORKDIR /app
COPY pyproject.toml .
RUN uv pip install --system -e ".[dev]"
COPY src/ src/
EXPOSE 8200
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8200", "--reload"]
